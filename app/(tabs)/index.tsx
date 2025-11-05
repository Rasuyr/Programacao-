import { Audio } from 'expo-av';
import * as MediaLibrary from 'expo-media-library';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Modal, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';

import library from '@/assets/data/library.json';
import { ThemedView } from '@/components/themed-view';

const API_BASE = 'http://localhost:3333';

type Track = {
  id?: string;
  url: string;
  title: string;
  artist?: string;
  artwork?: string;
  rating?: number;
  playlist?: string[];
};

export default function TabIndex() {
  const [query, setQuery] = useState('');
  const [tracks, setTracks] = useState<Track[]>([]);
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [activeTrack, setActiveTrack] = useState<Track | null>(null);
  const [positionMillis, setPositionMillis] = useState<number>(0);
  const [durationMillis, setDurationMillis] = useState<number>(0);
  const progressWidthRef = React.useRef<number>(0);
  const [showPicker, setShowPicker] = useState(false);
  const [deviceAssets, setDeviceAssets] = useState<MediaLibrary.Asset[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);
  const [selectedDeviceIds, setSelectedDeviceIds] = useState<Record<string, boolean>>({});
  const isPlayingRef = React.useRef<boolean>(false);
  const isLoadingRef = React.useRef<boolean>(false);

  async function openDevicePicker() {
    setShowPicker(true);
    setPickerLoading(true);
    try {
      const res = await MediaLibrary.requestPermissionsAsync();
      const ok = res.granted || res.status === 'granted' || res.canAskAgain;
      
      if (!ok) {
        Alert.alert(
          'Permissão necessária', 
          'Permissão para acessar a biblioteca de mídia foi negada. Por favor, vá em Configurações e permita o acesso ao armazenamento.',
          [
            { text: 'OK', style: 'default' }
          ]
        );
        setPickerLoading(false);
        return;
      }

      if (res.status === 'undetermined' && res.canAskAgain) {
        // Try requesting again
        const res2 = await MediaLibrary.requestPermissionsAsync();
        if (!res2.granted && res2.status !== 'granted') {
          Alert.alert('Permissão negada', 'Não foi possível acessar o armazenamento sem permissão.');
          setPickerLoading(false);
          return;
        }
      }

      const list = await MediaLibrary.getAssetsAsync({ 
        mediaType: 'audio', 
        first: 500, 
        sortBy: ['creationTime'] 
      });
      setDeviceAssets(list.assets ?? []);
    } catch (e: any) {
      console.error('Error accessing storage:', e);
      Alert.alert(
        'Erro ao acessar armazenamento', 
        e?.message || 'Não foi possível acessar o armazenamento. Verifique se as permissões foram concedidas nas configurações do dispositivo.'
      );
    } finally {
      setPickerLoading(false);
    }
  }

  useEffect(() => {
    // Configure audio mode to interrupt other audio
    Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      staysActiveInBackground: false,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
      playThroughEarpieceAndroid: false,
    });

    loadTracksFromAPI();
    return () => {
      if (sound) {
        sound.unloadAsync().catch(() => {});
      }
    };
  }, []);

  async function loadTracksFromAPI() {
    try {
      const res = await fetch(`${API_BASE}/tracks`);
      const data = await res.json();
      if (data && data.length > 0) {
        setTracks(data);
      } else {
        // Fallback to local library if API is empty
        setTracks(library as Track[]);
      }
    } catch (e) {
      console.error('Failed to load tracks from API, using local library', e);
      // Fallback to local library if API fails
      setTracks(library as Track[]);
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return tracks;
    return tracks.filter((t) => {
      return (
        (t.title && t.title.toLowerCase().includes(q)) ||
        (t.artist && t.artist.toLowerCase().includes(q)) ||
        (t.playlist && t.playlist.join(' ').toLowerCase().includes(q))
      );
    });
  }, [query, tracks]);

  async function playTrack(track: Track) {
    // Prevent multiple simultaneous calls
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;

    try {
      // Stop and unload current sound first
      if (sound) {
        try {
          await sound.stopAsync();
          await sound.unloadAsync();
        } catch (e) {
          console.error('Error stopping previous sound', e);
        }
        setSound(null);
      }

      setPlayingUrl(null);
      setIsPlaying(false);
      isPlayingRef.current = false;

      // Create and play new sound
      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: track.url },
        { shouldPlay: true }
      );
      
      setSound(newSound);
      setPlayingUrl(track.url);
      setIsPlaying(true);
      isPlayingRef.current = true;
      setActiveTrack(track);
   
      newSound.setOnPlaybackStatusUpdate((status) => {
        const s = status as any;
        if (s?.isLoaded) {
          setPositionMillis(s.positionMillis ?? 0);
          setDurationMillis(s.durationMillis ?? 0);
          const playing = Boolean(s.isPlaying);
          setIsPlaying(playing);
          isPlayingRef.current = playing;
          if (s.didJustFinish) playNext();
        }
      });
    } catch (e) {
      console.error('Error playing track', e);
      setIsPlaying(false);
      isPlayingRef.current = false;
    } finally {
      isLoadingRef.current = false;
    }
  }

  function findCurrentIndex(): number {
    if (!activeTrack) return -1;
    return tracks.findIndex((t) => t.url === activeTrack.url);
  }

  function playNext() {
    if (!tracks || tracks.length === 0) return;
    const idx = findCurrentIndex();
    const nextIdx = idx < 0 ? 0 : (idx + 1) % tracks.length;
    const next = tracks[nextIdx];
    if (next) playTrack(next);
  }

  function playPrevious() {
    if (!tracks || tracks.length === 0) return;
    const idx = findCurrentIndex();
    if (idx <= 0) {
      
      const last = tracks[tracks.length - 1];
      if (last) playTrack(last);
      return;
    }
    const prev = tracks[idx - 1];
    if (prev) playTrack(prev);
  }

  async function togglePlayPause() {
    try {
      if (!sound) return;
      
      // Update state optimistically for immediate UI feedback
      const currentPlaying = isPlayingRef.current;
      setIsPlaying(!currentPlaying);
      isPlayingRef.current = !currentPlaying;

      if (currentPlaying) {
        // Pause immediately
        sound.pauseAsync().catch((e) => {
          console.error('Error pausing', e);
          // Revert state on error
          setIsPlaying(true);
          isPlayingRef.current = true;
        });
      } else {
        // Play immediately
        sound.playAsync().catch((e) => {
          console.error('Error playing', e);
          // Revert state on error
          setIsPlaying(false);
          isPlayingRef.current = false;
        });
      }
    } catch (e) {
      console.error('Error in togglePlayPause', e);
    }
  }

  function renderItem({ item }: { item: Track }) {
    const isPlaying = playingUrl === item.url;

    return (
      <Pressable style={styles.item} onPress={() => playTrack(item)}>
        {item.artwork ? (
          <Image source={{ uri: item.artwork }} style={styles.artwork} />
        ) : (
          <View style={[styles.artwork, styles.artworkPlaceholder]} />
        )}

        <View style={styles.info}>
          <Text style={styles.itemTitle}>{item.title}</Text>
          <Text style={styles.artist}>
            {item.artist ?? 'Unknown artist'} {isPlaying ? ' · ▶' : ''}
          </Text>
        </View>
      </Pressable>
    );
  }

  return (
    <ThemedView style={styles.container}>
      <View style={styles.pageHeader}>
        <Text style={styles.pageTitle}>Minhas Músicas</Text>
      </View>

      <View style={styles.searchWrap}>
        <TextInput
          placeholder="Procurar músicas, artistas ou playlists"
          placeholderTextColor="rgba(255,255,255,0.6)"
          value={query}
          onChangeText={setQuery}
          style={styles.search}
          clearButtonMode="while-editing"
        />

        <Pressable style={styles.searchButton} onPress={async () => {
          openDevicePicker();
        }} accessibilityLabel="Buscar músicas no dispositivo">
          <IconSymbol name="house.fill" size={20} color="#fff" />
        </Pressable>
      </View>

      {/* Device picker modal */}
      <Modal visible={showPicker} animationType="slide" onRequestClose={() => setShowPicker(false)}>
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={{ fontSize: 18, fontWeight: '600' }}>Músicas no dispositivo</Text>
            <TouchableOpacity onPress={() => setShowPicker(false)}>
              <Text style={{ color: '#007AFF' }}>Fechar</Text>
            </TouchableOpacity>
          </View>

          {pickerLoading ? (
            <View style={{ padding: 20 }}>
              <ActivityIndicator />
            </View>
          ) : (
            <FlatList
              data={deviceAssets}
              keyExtractor={(i) => i.id}
              renderItem={({ item }) => (
                <Pressable
                  style={styles.deviceItem}
                  onPress={() => {
                    setSelectedDeviceIds((s) => ({ ...s, [item.id]: !s[item.id] }));
                  }}
                >
                  <View style={styles.deviceThumbPlaceholder} />
                  <View style={{ marginLeft: 12, flex: 1 }}>
                    <Text numberOfLines={1}>{item.filename}</Text>
                    <Text style={{ color: '#666', marginTop: 4 }}>{item.duration ? `${Math.round(item.duration)}s` : ''}</Text>
                  </View>
                  <View style={{ width: 24, alignItems: 'center' }}>
                    {selectedDeviceIds[item.id] ? <Text>✓</Text> : null}
                  </View>
                </Pressable>
              )}
            />
          )}

          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => {
                setShowPicker(false);
              }}
            >
              <Text>Cancelar</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.importButton}
              onPress={async () => {
                // import selected
                const ids = Object.keys(selectedDeviceIds).filter((k) => selectedDeviceIds[k]);
                const selected = deviceAssets.filter((a) => ids.includes(a.id));
                if (selected.length === 0) {
                  Alert.alert('Nenhuma seleção', 'Selecione ao menos uma música para importar.');
                  return;
                }
                
                // Save to API first
                try {
                  const tracksToSave = selected.map((a) => ({
                    url: a.uri,
                    title: a.filename?.replace(/\.[^/.]+$/, '') || 'Unknown',
                    artist: undefined,
                    artwork: undefined,
                  }));

                  // Save each track to API
                  for (const track of tracksToSave) {
                    try {
                      await fetch(`${API_BASE}/tracks`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(track),
                      });
                    } catch (e) {
                      console.error('Failed to save track to API', e);
                    }
                  }

                  // Reload tracks from API
                  await loadTracksFromAPI();
                  setShowPicker(false);
                  Alert.alert('Importadas', `${tracksToSave.length} músicas adicionadas.`);
                } catch (e) {
                  console.error('Failed to import tracks', e);
                  Alert.alert('Erro', 'Algumas músicas podem não ter sido salvas.');
                  setShowPicker(false);
                }
              }}
            >
              <Text style={{ color: '#fff' }}>Importar selecionadas</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.url}
        renderItem={renderItem}
        contentContainerStyle={[styles.list, activeTrack ? { paddingBottom: 92 } : undefined]}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
      />

      {/* Fixed bottom player */}
      {activeTrack ? (
        <View style={styles.playerWrap} pointerEvents="box-none">
          <View style={styles.player}>
            {activeTrack.artwork ? (
              <Image source={{ uri: activeTrack.artwork }} style={styles.playerArtwork} />
            ) : (
              <View style={[styles.playerArtwork, styles.artworkPlaceholder]} />
            )}

            <View style={styles.playerInfo}>
              <Text style={styles.playerTitle}>{activeTrack.title}</Text>
              <Text style={styles.playerArtist}>{activeTrack.artist ?? 'Unknown artist'}</Text>
            </View>

            {/* progress bar */}
            <View style={styles.progressWrap}>
              <Pressable
                style={styles.progressContainer}
                onLayout={(e) => {
                  progressWidthRef.current = e.nativeEvent.layout.width;
                }}
                onPress={async (e) => {
                  if (!sound || !durationMillis) return;
                  const x = e.nativeEvent.locationX;
                  const w = progressWidthRef.current || 1;
                  const ratio = Math.max(0, Math.min(1, x / w));
                  const newPos = Math.floor(ratio * durationMillis);
                  try {
                    await sound.setPositionAsync(newPos);
                  } catch {}
                }}
              >
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: durationMillis ? `${(positionMillis / durationMillis) * 100}%` : '0%' }]} />
                </View>
              </Pressable>
            </View>

            <View style={styles.controls}>
              <Pressable onPress={playPrevious} style={styles.controlButton} accessibilityLabel="Previous">
                <IconSymbol name="chevron.left" size={20} color="#000" />
              </Pressable>

              <Pressable onPress={togglePlayPause} style={styles.playButton} accessibilityLabel="Play or pause">
                <IconSymbol name={isPlaying ? 'pause.fill' : 'play.fill'} size={20} color="#000" />
              </Pressable>

              <Pressable onPress={playNext} style={styles.controlButton} accessibilityLabel="Next">
                <IconSymbol name="chevron.left" size={20} color="#000" style={{ transform: [{ rotate: '180deg' }] }} />
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 12,
    paddingTop: 12,
    backgroundColor: '#000',
  },
  pageHeader: {
    marginBottom: 12,
    justifyContent: 'center',
  },
  pageTitle: {
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
  },
  searchWrap: {
    marginBottom: 8,
    flexDirection: 'row',
    alignItems: 'center',
  },
  search: {
    height: 44,
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.1)',
    color: '#fff',
    flex: 1,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  list: {
    paddingBottom: 32,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
  },
  artwork: {
    width: 60,
    height: 60,
    borderRadius: 6,
    backgroundColor: '#ddd',
  },
  artworkPlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  info: {
    marginLeft: 12,
    flex: 1,
  },
  artist: {
    marginTop: 4,
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    fontWeight: '400',
  },
  separator: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
  },
  playerTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000',
  },
  playerArtist: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  playerWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: 12,
    backgroundColor: 'transparent',
  },
  player: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.95)',
    borderRadius: 12,
    padding: 8,
    shadowColor: '#3f19e6ff',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 4,
  },
  playerArtwork: {
    width: 48,
    height: 48,
    borderRadius: 6,
    backgroundColor: '#2512ccff',
  },
  playerInfo: {
    marginLeft: 10,
    flex: 1,
  },
  playButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginLeft: 8,
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  controlButton: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    marginHorizontal: 4,
  },
  searchButton: {
    marginLeft: 8,
    padding: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  progressWrap: {
    paddingHorizontal: 8,
    paddingTop: 8,
  },
  progressContainer: {
    width: '100%',
  },
  progressTrack: {
    height: 6,
    backgroundColor: '#e6e6e6',
    borderRadius: 4,
    overflow: 'hidden',
  },
  progressFill: {
    height: 6,
    backgroundColor: '#111',
  },
  modalContainer: { flex: 1, padding: 16, backgroundColor: '#fff' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  deviceItem: { flexDirection: 'row', alignItems: 'center', paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(0,0,0,0.04)' },
  deviceThumbPlaceholder: { width: 56, height: 40, backgroundColor: '#ddd', borderRadius: 6 },
  modalFooter: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12 },
  cancelButton: { padding: 10 },
  importButton: { padding: 10, backgroundColor: '#000', borderRadius: 8 },
});


