import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Alert, AppState, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import * as Media from 'expo-media-library';
import { SafeAreaView } from 'react-native-safe-area-context';
import { PhotoCard, type PhotoCardHandle } from '../components/PhotoCard';
import { createDecisionGate, mergePhotoQueue, nextUnreviewed, type Choice } from '../domain/decisions';
import { getMediaManagementStatus, openMediaManagementSettings, type MediaManagementStatus } from '../services/mediaManagement';
import { finishOnboarding, getKept, hasOnboarded, keepPhoto } from '../services/progress';
import { AlbumPicker, type AlbumChoice } from '../components/AlbumPicker';

export default function Home() {
  const [ready, setReady] = useState(false);
  const [onboarded, setOnboarded] = useState(false);
  const [permission, setPermission] = useState<Media.PermissionResponse | null>(null);
  const [photos, setPhotos] = useState<Media.Asset[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [message, setMessage] = useState('');
  const [failedId, setFailedId] = useState('');
  const [loadedId, setLoadedId] = useState('');
  const [photoDate, setPhotoDate] = useState<{ id: string; text: string } | null>(null);
  const [counts, setCounts] = useState({ kept: 0, deleted: 0 });
  const [reducedMotion, setReducedMotion] = useState(false);
  const [management, setManagement] = useState<MediaManagementStatus>({ supported: false, granted: false });
  const [albumPickerOpen, setAlbumPickerOpen] = useState(false);
  const [albumChoice, setAlbumChoice] = useState<AlbumChoice | null>(null);
  const selectedAlbum = useRef<AlbumChoice | null>(null);
  const card = useRef<PhotoCardHandle>(null);
  const revision = useRef(0);
  const refreshing = useRef(false);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const lock = useRef(false);
  const dirty = useRef(false);
  const mounted = useRef(true);
  const skipped = useRef(new Set<string>());
  const handled = useRef(new Set<string>());
  const refreshRef = useRef<(request?: boolean, background?: boolean) => Promise<void>>(async () => {});
  const refresh = useCallback(async (request = false, background = false) => {
    if (lock.current || (background && refreshing.current)) { dirty.current = true; return; }
    if (background) { refreshing.current = true; setLoadingMore(true); }
    else { lock.current = true; revision.current++; setBusy(true); }
    const startedAt = revision.current;
    try {
      const [access, direct] = await Promise.all([
        request ? Media.requestPermissionsAsync(false, ['photo']) : Media.getPermissionsAsync(false, ['photo']),
        getMediaManagementStatus().catch(() => ({ supported: false, granted: false })),
      ]);
      if (!mounted.current || startedAt !== revision.current) { dirty.current = true; return; }
      setPermission(access);
      setManagement(direct);
      if (access.status !== 'granted' && access.accessPrivileges !== 'limited') { setPhotos([]); return; }
      const kept = await getKept();
      const excluded = new Set([...skipped.current, ...handled.current]);
      const album = selectedAlbum.current;
      const queue = await nextUnreviewed((offset, limit) => {
        const query = new Media.Query().eq(Media.AssetField.MEDIA_TYPE, Media.MediaType.IMAGE);
        if (album) query.album(album.album);
        return query.orderBy({ key: Media.AssetField.CREATION_TIME, ascending: false })
          .offset(offset).limit(limit).exe();
      }, kept, excluded);
      if (!mounted.current || startedAt !== revision.current) { dirty.current = true; return; }
      setPhotos(previous => background ? mergePhotoQueue(previous, queue, handled.current) : queue);
      void Image.prefetch(queue.slice(0, 4).map(photo => photo.id), { cachePolicy: 'memory' }).catch(() => {});
    } catch {
      if (mounted.current && startedAt === revision.current) setMessage('Could not load your photos. Check photo access and try Refresh.');
    } finally {
      if (background) { refreshing.current = false; if (mounted.current) setLoadingMore(false); }
      else { lock.current = false; if (mounted.current) setBusy(false); }
      if (mounted.current && dirty.current && !lock.current) {
        dirty.current = false;
        clearTimeout(refreshTimer.current);
        refreshTimer.current = setTimeout(() => { void refreshRef.current(false, true); }, 500);
      }
    }
  }, []);
  useEffect(() => { refreshRef.current = refresh; }, [refresh]);

  useEffect(() => {
    mounted.current = true;
    hasOnboarded().then(async done => {
      if (!mounted.current) return;
      setOnboarded(done);
      setReady(true);
      if (done) await refresh();
    }).catch(() => { if (mounted.current) { setReady(true); setMessage('Local progress could not be opened. Close and reopen the app to retry.'); } });
    AccessibilityInfo.isReduceMotionEnabled().then(setReducedMotion).catch(() => {});
    const motion = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => { mounted.current = false; motion.remove(); clearTimeout(refreshTimer.current); };
  }, [refresh]);

  useEffect(() => {
    if (!onboarded) return;
    const resume = AppState.addEventListener('change', state => { if (state === 'active') void refresh(false, true); });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const media = Media.addListener(() => { clearTimeout(timer); timer = setTimeout(() => { void refresh(false, true); }, 750); });
    return () => { resume.remove(); media.remove(); clearTimeout(timer); };
  }, [onboarded, refresh]);

  const current = photos[0];
  const failedImage = !!current && current.id === failedId;
  const date = current && photoDate?.id === current.id ? photoDate.text : '';
  useEffect(() => {
    if (!current) return;
    let active = true;
    const id = current.id;
    current.getCreationTime().then(value => {
      if (active) setPhotoDate({ id, text: value ? new Date(value).toLocaleDateString(undefined, { month: 'long', day: 'numeric', year: 'numeric' }) : 'Date unavailable' });
    }).catch(() => { if (active) setPhotoDate({ id, text: 'Date unavailable' }); });
    return () => { active = false; };
  }, [current]);

  const [gate] = useState(() => createDecisionGate<Media.Asset>({
    keep: photo => keepPhoto(photo.id),
    delete: photo => photo.delete(),
  }));

  const decide = async (choice: Choice) => {
    if (lock.current || !current || handled.current.has(current.id) || failedImage || loadedId !== current.id) { card.current?.reset(); return; }
    lock.current = true;
    revision.current++;
    setBusy(true);
    setMessage('');
    try {
      const [result] = await Promise.all([gate(current, choice), card.current?.exit(choice)]);
      if (result === 'busy') { card.current?.reset(); return; }
      handled.current.add(current.id);
      if (!mounted.current) return;
      setCounts(previous => ({ ...previous, [result === 'kept' ? 'kept' : 'deleted']: previous[result === 'kept' ? 'kept' : 'deleted'] + 1 }));
      setMessage(result === 'kept' ? 'Kept. Your photo stays in your gallery.' : 'Photo deleted.');
      setPhotos(previous => previous.filter(photo => photo.id !== current.id));
      if (photos.length < 8) dirty.current = true;
    } catch {
      card.current?.reset();
      if (mounted.current) setMessage(choice === 'delete' ? 'Deletion cancelled or unavailable. The photo has not been marked as deleted.' : 'Could not save your choice. Please try again.');
    } finally {
      lock.current = false;
      if (mounted.current) {
        setBusy(false);
        if (dirty.current) { dirty.current = false; void refresh(false, true); }
      }
    }
  };

  const begin = async () => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setMessage('');
    try { await finishOnboarding(); setOnboarded(true); }
    catch { setMessage('Could not save setup. Please try again.'); return; }
    finally { lock.current = false; setBusy(false); }
    await refresh(true);
  };

  const changeAlbum = (choice: AlbumChoice | null) => {
    if (lock.current) return;
    revision.current++;
    selectedAlbum.current = choice;
    setAlbumChoice(choice);
    setAlbumPickerOpen(false);
    setPhotos([]);
    setLoadedId('');
    setFailedId('');
    setMessage('');
    skipped.current.clear();
    void refresh();
  };

  const manageAccess = async () => {
    if (lock.current) return;
    try {
      if (permission?.accessPrivileges === 'limited') await Media.presentPermissionsPicker(['photo']);
      else await Linking.openSettings();
      await refresh();
    } catch { setMessage('Open Android Settings, then allow photo access for Flick.'); }
  };

  const manageDirectDeletion = () => Alert.alert(
    management.granted ? 'Direct deletion is enabled' : 'Enable direct deletion?',
    'Manage media access lets Flick delete the photos you swipe right on without asking each time. You can change this access in Android Settings.',
    [{ text: 'Cancel', style: 'cancel' }, { text: 'Open settings', onPress: () => {
      void openMediaManagementSettings().catch(() => setMessage('Could not open this Settings page. Open Android Settings → Special app access → Media management apps.'));
    } }],
  );

  const allowed = permission?.status === 'granted' || permission?.accessPrivileges === 'limited';
  return <SafeAreaView style={s.page}>
    <View style={s.header}>
      <View style={s.brand}><Image source={require('../../assets/flick-logo.png')} style={s.brandMark} contentFit="contain" /><Text style={s.brandName}>flick<Text style={s.dot}>.</Text></Text></View>
      {onboarded && <Pressable accessibilityRole="button" accessibilityLabel="Refresh photo library" disabled={busy} onPress={() => { setMessage(''); void refresh(); }} style={s.refresh}><Text style={s.refreshText}>Refresh</Text></Pressable>}
    </View>
    {!ready ? <View style={s.center}><ActivityIndicator color="#276951" /><Text style={s.body}>Opening your space…</Text></View>
      : !onboarded ? <ScrollView contentContainerStyle={s.onboarding}>
        <Text style={s.eyebrow}>A LITTLE LESS CLUTTER</Text>
        <Text style={s.title}>Make room{ '\n' }for what matters.</Text>
        <Text style={s.body}>One photo. One simple choice. A lighter camera roll.</Text>
        <View style={s.demo}><View style={s.demoInner}><Text style={s.demoIcon}>▧</Text><Text style={s.demoText}>Your photos, one at a time</Text></View></View>
        <View style={s.rule}><Text style={s.ruleIcon}>←</Text><View style={s.ruleCopy}><Text style={s.ruleTitle}>Swipe left to keep</Text><Text style={s.small}>It stays in your gallery. We remember your choice.</Text></View></View>
        <View style={s.rule}><Text style={[s.ruleIcon, { color: '#B63E32' }]}>→</Text><View style={s.ruleCopy}><Text style={s.ruleTitle}>Swipe right to delete</Text><Text style={s.small}>Deletion starts immediately. Android may ask you to confirm. There is no undo in this app.</Text></View></View>
        <Action label="Let’s make some space" onPress={() => { void begin(); }} disabled={busy} />
        <Text style={s.privacy}>Only on your phone. No uploads. No account.</Text>
      </ScrollView>
      : !allowed ? <View style={s.center}>
        <Text style={s.emptyIcon}>▧</Text><Text style={s.stateTitle}>Your gallery starts here.</Text>
        <Text style={s.body}>Allow photo access to choose what stays and what goes. Photos are processed on your device.</Text>
        <Action label={busy ? 'Opening…' : 'Allow photo access'} disabled={busy} onPress={() => { void refresh(true); }} />
        <Pressable disabled={busy} onPress={() => { void manageAccess(); }} style={s.linkButton}><Text style={s.link}>Open settings</Text></Pressable>
      </View>
      : <View style={s.main}>
        <View style={s.intro}><Text style={s.eyebrow}>YOUR CAMERA ROLL, LIGHTER</Text><Text style={s.screenTitle}>A fresh start.</Text>
          <View style={s.statRow}><Text style={s.small}><Text style={s.stat}>{counts.kept}</Text> kept this session</Text><Text style={s.small}><Text style={s.stat}>{counts.deleted}</Text> deleted</Text></View>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={`Change album. Current: ${albumChoice?.title ?? 'All photos'}`} disabled={busy} onPress={() => setAlbumPickerOpen(true)} style={s.albumButton}>
          <Text numberOfLines={1} style={s.albumTitle}>{albumChoice?.title ?? 'All photos'}</Text><Text style={s.link}>Change album ▾</Text>
        </Pressable>
        {management.supported && <Pressable accessibilityRole="button" disabled={busy} onPress={manageDirectDeletion} style={s.limited}>
          <Text style={s.limitedText}>{management.granted ? '✓ Direct deletion is on · Settings ↗' : 'Enable direct deletion · Manage media ↗'}</Text>
          {!management.granted && <Text style={s.small}>Allow once in Android Settings to skip repeated deletion prompts.</Text>}
        </Pressable>}
        {permission?.accessPrivileges === 'limited' && <Pressable disabled={busy} onPress={() => { void manageAccess(); }} style={s.limited}><Text style={s.limitedText}>Selected photos only · Manage access ↗</Text></Pressable>}
        {current ? <>
          <View style={s.deck}>
            <PhotoCard ref={card} key={current.id} id={current.id} nextId={photos[1]?.id} onChoice={choice => { void decide(choice); }} disabled={busy || albumPickerOpen || failedImage || loadedId !== current.id} reducedMotion={reducedMotion} onError={() => setFailedId(current.id)} onLoad={() => { setLoadedId(current.id); setFailedId(''); }} />
            {!failedImage && loadedId !== current.id && <View pointerEvents="none" style={s.imageLoading}><ActivityIndicator color="#276951" /></View>}
            {failedImage && <View style={s.unavailable}><Text style={s.ruleTitle}>This photo can’t be displayed.</Text><Text style={s.small}>It may have moved or may not be downloaded.</Text><Pressable disabled={busy} style={s.linkButton} onPress={() => { skipped.current.add(current.id); void refresh(); }}><Text style={s.link}>Skip for now →</Text></Pressable></View>}
          </View>
          <View style={s.photoMeta}><Text style={s.small}>{date || 'Your photo'}</Text>{busy && <ActivityIndicator size="small" color="#276951" />}</View>
          <View style={s.actions}>
            <Pressable accessibilityRole="button" accessibilityLabel="Keep this photo" onPress={() => { void decide('keep'); }} disabled={busy || failedImage || loadedId !== current.id} style={[s.choice, s.keepChoice, (busy || failedImage || loadedId !== current.id) && s.disabled]}><Text style={s.keepArrow}>←</Text><Text style={s.keepLabel}>Keep</Text></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Delete this photo immediately" onPress={() => { void decide('delete'); }} disabled={busy || failedImage || loadedId !== current.id} style={[s.choice, s.deleteChoice, (busy || failedImage || loadedId !== current.id) && s.disabled]}><Text style={s.deleteLabel}>Delete</Text><Text style={s.deleteArrow}>→</Text></Pressable>
          </View>
        </> : <View style={s.center}>
          {busy || loadingMore ? <><ActivityIndicator color="#276951" /><Text style={s.body}>Finding your next photo…</Text></> : <><Text style={s.emptyIcon}>✓</Text><Text style={s.stateTitle}>A little lighter.</Text><Text style={s.body}>No more unreviewed photos in {albumChoice ? 'this album' : 'your accessible library'}. Choose another album, add more photos, or change photo access.</Text><Action label="Change album" onPress={() => setAlbumPickerOpen(true)} disabled={busy} /></>}
        </View>}
      </View>}
    {albumPickerOpen && <AlbumPicker selectedId={albumChoice?.album.id} onChoose={changeAlbum} onClose={() => setAlbumPickerOpen(false)} limited={permission?.accessPrivileges === 'limited'} />}
    <View style={s.footer}><Text accessibilityLiveRegion="polite" style={s.feedback}>{message || (onboarded ? 'LEFT TO KEEP  ·  RIGHT TO DELETE' : '')}</Text></View>
  </SafeAreaView>;
}

function Action({ label, onPress, disabled }: { label: string; onPress: () => void; disabled: boolean }) {
  return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={[s.primary, disabled && s.disabled]}><Text style={s.primaryText}>{label}</Text></Pressable>;
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F8F7F3' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingTop: 15, paddingBottom: 18 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 9 }, brandMark: { width: 40, height: 40, borderRadius: 9 },
  brandName: { fontSize: 22, fontWeight: '700', letterSpacing: -0.8, color: '#212E28' }, dot: { color: '#2354EB' },
  refresh: { padding: 10, borderRadius: 20, backgroundColor: '#ECEDE6' }, refreshText: { fontSize: 12, fontWeight: '600', color: '#415349' },
  main: { flex: 1, paddingHorizontal: 24 }, intro: { marginBottom: 20 }, eyebrow: { color: '#6D7B70', fontSize: 10, fontWeight: '700', letterSpacing: 2 },
  title: { fontSize: 43, lineHeight: 49, letterSpacing: -1.8, fontWeight: '600', color: '#212E28', marginTop: 16 },
  screenTitle: { fontSize: 35, letterSpacing: -1.4, fontWeight: '600', color: '#212E28', marginTop: 8 },
  body: { fontSize: 16, lineHeight: 25, color: '#697269', marginVertical: 16 }, small: { fontSize: 12, color: '#697269', lineHeight: 19 },
  statRow: { flexDirection: 'row', gap: 24, marginTop: 10 }, stat: { color: '#273D30', fontWeight: '700' },
  deck: { flex: 1, minHeight: 120, marginTop: 5, marginBottom: 12 },
  photoMeta: { minHeight: 26, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  actions: { flexDirection: 'row', gap: 14 }, choice: { minHeight: 60, flex: 1, borderRadius: 18, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 20 },
  keepChoice: { backgroundColor: '#E4EDE3', borderWidth: 1, borderColor: '#D2DFCF' }, deleteChoice: { backgroundColor: '#F6E5DE', borderWidth: 1, borderColor: '#EFD3C7' },
  keepArrow: { fontSize: 26, color: '#276951' }, deleteArrow: { fontSize: 26, color: '#A64736' }, keepLabel: { fontSize: 17, fontWeight: '600', color: '#276951' }, deleteLabel: { fontSize: 17, fontWeight: '600', color: '#A64736' },
  center: { flex: 1, justifyContent: 'center', paddingHorizontal: 28 }, stateTitle: { fontSize: 29, fontWeight: '600', color: '#212E28', letterSpacing: -1, marginTop: 12 }, emptyIcon: { fontSize: 54, color: '#276951' },
  primary: { backgroundColor: '#276951', borderRadius: 16, minHeight: 58, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20, marginTop: 16 }, primaryText: { color: '#FFF', fontSize: 16, fontWeight: '600' }, disabled: { opacity: 0.5 },
  onboarding: { paddingHorizontal: 28, paddingTop: 22, paddingBottom: 10 }, demo: { height: 155, marginVertical: 16, borderRadius: 23, backgroundColor: '#E5EADD', padding: 15, transform: [{ rotate: '-3deg' }] }, demoInner: { flex: 1, backgroundColor: '#F1F2E9', borderRadius: 14, alignItems: 'center', justifyContent: 'center' }, demoIcon: { fontSize: 55, color: '#749078' }, demoText: { fontSize: 12, color: '#5D7460', marginTop: 6 },
  rule: { flexDirection: 'row', alignItems: 'flex-start', gap: 16, marginVertical: 14 }, ruleIcon: { fontSize: 28, color: '#276951', width: 32 }, ruleCopy: { flex: 1 }, ruleTitle: { fontSize: 16, fontWeight: '600', color: '#273D30', marginBottom: 5 },
  privacy: { color: '#778175', fontSize: 11, textAlign: 'center', marginTop: 16 }, footer: { paddingHorizontal: 24, paddingBottom: 8, paddingTop: 4, minHeight: 36 }, feedback: { fontSize: 11, lineHeight: 17, color: '#697269', textAlign: 'center' },
  albumButton: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, marginBottom: 8 }, albumTitle: { flex: 1, fontSize: 15, fontWeight: '600', color: '#273D30' },
  link: { fontSize: 12, color: '#3B6550', textDecorationLine: 'underline' }, linkButton: { paddingVertical: 18, alignItems: 'center' },
  limited: { backgroundColor: '#EBEFE4', padding: 10, borderRadius: 9, marginBottom: 14 }, limitedText: { fontSize: 11, color: '#456047' },
  unavailable: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, justifyContent: 'center', alignItems: 'center', backgroundColor: '#F0EFE8F5', borderRadius: 24, padding: 20 },
  imageLoading: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, alignItems: 'center', justifyContent: 'center' },
});
