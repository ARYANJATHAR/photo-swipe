import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Album } from 'expo-media-library';

export type AlbumChoice = { album: Album; title: string };

export function AlbumPicker({ selectedId, limited, onChoose, onClose }: {
  selectedId?: string;
  limited: boolean;
  onChoose: (choice: AlbumChoice | null) => void;
  onClose: () => void;
}) {
  const [albums, setAlbums] = useState<AlbumChoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    void Album.getAll().then(items => Promise.all(items.map(async album => ({ album, title: await album.getTitle() }))))
      .then(items => { if (active) setAlbums(items.sort((a, b) => a.title.localeCompare(b.title))); })
      .catch(() => { if (active) setError('Could not load albums. Check photo access and try again.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [attempt]);

  const row = (title: string, selected: boolean, onPress: () => void) => <Pressable accessibilityRole="button" accessibilityState={{ selected }} onPress={onPress} style={s.row}>
    <Text style={s.name}>{title}</Text><Text style={s.check}>{selected ? '✓' : '›'}</Text>
  </Pressable>;
  return <Modal visible animationType="slide" onRequestClose={onClose}>
    <SafeAreaView style={s.page}>
      <View style={s.header}><Text style={s.title}>Choose album</Text><Pressable accessibilityRole="button" onPress={onClose} style={s.close}><Text style={s.link}>Close</Text></Pressable></View>
      <Text style={s.hint}>Choose which photos to review. Your kept photos stay kept when you switch albums.</Text>
      {limited && <Text style={s.hint}>Only photos allowed by Android are available. Use Manage access on the main screen to allow more.</Text>}
      <FlatList data={albums} keyExtractor={item => item.album.id}
        ListHeaderComponent={row('All photos', !selectedId, () => onChoose(null))}
        renderItem={({ item }) => row(item.title, item.album.id === selectedId, () => onChoose(item))}
        ListEmptyComponent={loading ? <ActivityIndicator style={s.loading} color="#276951" /> : <Text style={s.hint}>{error || 'No accessible albums found. You can still review All photos.'}</Text>}
        ListFooterComponent={error ? <Pressable accessibilityRole="button" style={s.close} onPress={() => { setLoading(true); setError(''); setAttempt(value => value + 1); }}><Text style={s.link}>Try again</Text></Pressable> : null}
      />
    </SafeAreaView>
  </Modal>;
}

const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: '#F8F7F3', paddingHorizontal: 24 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 16 },
  title: { fontSize: 28, fontWeight: '600', color: '#212E28', letterSpacing: -1 },
  close: { padding: 14 }, link: { color: '#276951', fontSize: 15, fontWeight: '600' },
  hint: { fontSize: 14, lineHeight: 22, color: '#697269', marginVertical: 14 },
  row: { minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: 16, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#D2DFCF' },
  name: { flex: 1, color: '#273D30', fontSize: 17 }, check: { fontSize: 22, color: '#276951' }, loading: { marginTop: 32 },
});
