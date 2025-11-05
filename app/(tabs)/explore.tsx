import { Video } from 'expo-av';
import * as DocumentPicker from 'expo-document-picker';
import * as MediaLibrary from 'expo-media-library';
import { useRouter } from 'expo-router';
import * as VideoThumbnails from 'expo-video-thumbnails';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Image, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ThemedView } from '@/components/themed-view';
import { IconSymbol } from '@/components/ui/icon-symbol';

type AssetItem = MediaLibrary.Asset;

const API_BASE = 'http://localhost:3333';

function formatTime(seconds: number): string {
  if (!isFinite(seconds) || isNaN(seconds)) return '0:00';
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export default function ExploreVideoScreen() {
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef<Video | null>(null);
  const router = useRouter();
  const [iconLarge, setIconLarge] = useState(false);
  const [playingUri, setPlayingUri] = useState<string | null>(null);
  const [selectedThumb, setSelectedThumb] = useState<string | null>(null);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [serverVideos, setServerVideos] = useState<any[]>([]);
  const [loadingServer, setLoadingServer] = useState(false);
  const progressBarWidth = useRef(0);

  useEffect(() => {
    (async () => {
      try {
        const res = await MediaLibrary.requestPermissionsAsync();
        const ok = res.granted || res.status === 'granted';
        
        if (!ok) {
          if (res.status === 'denied') {
            Alert.alert(
              'Permissão necessária', 
              'Preciso acessar os vídeos do dispositivo para listar e reproduzir. Por favor, vá em Configurações e permita o acesso ao armazenamento.'
            );
          }
          setLoading(false);
          return;
        }

        const list = await MediaLibrary.getAssetsAsync({ 
          mediaType: 'video', 
          first: 200, 
          sortBy: ['creationTime'] 
        });
        setAssets(list.assets ?? []);
      } catch (e: any) {
        console.error('Error loading videos:', e);
        Alert.alert(
          'Erro ao carregar vídeos', 
          e?.message || 'Não foi possível acessar os vídeos do dispositivo. Verifique as permissões nas configurações.'
        );
        setAssets([]);
      } finally {
        setLoading(false);
      }
    })();

    loadServerVideos();

    return () => {
      try {
        videoRef.current?.unloadAsync();
      } catch {}
    };
  }, []);

  async function loadServerVideos() {
    try {
      const res = await fetch(`${API_BASE}/videos`);
      const data = await res.json();
      setServerVideos(data || []);
    } catch (e) {
      console.error('Failed to load server videos', e);
      setServerVideos([]);
    }
  }

  async function searchServerVideos(query: string) {
    if (!query.trim()) {
      await loadServerVideos();
      return;
    }
    setLoadingServer(true);
    try {
      const res = await fetch(`${API_BASE}/videos/search?q=${encodeURIComponent(query)}`);
      const data = await res.json();
      setServerVideos(data || []);
    } catch (e) {
      console.error('Failed to search videos', e);
    } finally {
      setLoadingServer(false);
    }
  }

  async function saveVideoToServer(uri: string, title: string, thumbnail?: string) {
    try {
      await fetch(`${API_BASE}/videos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          localUri: uri,
          title,
          thumbnail,
        }),
      });
      await loadServerVideos();
    } catch (e) {
      console.error('Failed to save video to server', e);
    }
  }

  async function playIndex(index: number) {
    setSelectedIndex(index);
    const a = assets[index];
    if (!a) return;
    try {
      // unload previous
      if (videoRef.current) {
        try {
          await videoRef.current.unloadAsync();
        } catch {}
      }
      setPlayingUri(null);
      setSelectedThumb(null);
      await videoRef.current?.loadAsync({ uri: a.uri }, { shouldPlay: true });
      setIsPlaying(true);
    } catch {
      // ignore
    }
  }

  async function playServerVideo(video: any) {
    const uri = video.localUri || video.url;
    if (!uri) return;
    try {
      if (videoRef.current) {
        try {
          await videoRef.current.unloadAsync();
        } catch {}
      }
      setSelectedIndex(null);
      setPlayingUri(uri);
      if (video.thumbnail) {
        setSelectedThumb(video.thumbnail);
      } else {
        try {
          const tn = await VideoThumbnails.getThumbnailAsync(uri, { time: 0 });
          setSelectedThumb(tn.uri ?? null);
        } catch (e) {
          setSelectedThumb(null);
        }
      }
      await videoRef.current?.loadAsync({ uri }, { shouldPlay: true });
      setIsPlaying(true);
    } catch (e) {
      Alert.alert('Erro', 'Não foi possível reproduzir o vídeo.');
    }
  }

  async function pickVideoFile() {
    try {
      const res = await DocumentPicker.getDocumentAsync({ 
        type: 'video/*',
        copyToCacheDirectory: true,
        multiple: false,
      });
      
      if (!res.canceled && res.assets && res.assets.length > 0) {
        const asset = res.assets[0];
        if (!asset.uri) return;
        
        // stop current
        try { 
          if (videoRef.current) {
            await videoRef.current.stopAsync();
            await videoRef.current.unloadAsync();
          }
        } catch (e) {
          console.error('Error stopping current video', e);
        }
        
        setSelectedIndex(null);
        setPlayingUri(asset.uri);
        let thumbUri = null;
        
        try {
          const tn = await VideoThumbnails.getThumbnailAsync(asset.uri, { time: 0 });
          thumbUri = tn.uri ?? null;
          setSelectedThumb(thumbUri);
        } catch (e) {
          console.error('Error generating thumbnail', e);
          setSelectedThumb(null);
        }
        
        try {
          if (videoRef.current) {
            await videoRef.current.loadAsync({ uri: asset.uri }, { shouldPlay: true });
            setIsPlaying(true);
            // Save to server
            const fileName = asset.name || 'Vídeo do armazenamento';
            await saveVideoToServer(asset.uri, fileName, thumbUri || undefined);
          }
        } catch (e) {
          console.error('Error loading video', e);
          Alert.alert('Erro', 'Não foi possível reproduzir o vídeo selecionado.');
        }
      }
      // If canceled, do nothing
    } catch (e: any) {
      console.error('Error picking video file', e);
      Alert.alert('Erro', e?.message || 'Não foi possível abrir o seletor de arquivos.');
    }
  }

  async function seekTo(seconds: number) {
    if (!videoRef.current) return;
    try {
      const status = await videoRef.current.getStatusAsync();
      if (status.isLoaded) {
        await videoRef.current.setPositionAsync(Math.max(0, Math.min(seconds, duration)));
      }
    } catch (e) {
      console.error('Failed to seek', e);
    }
  }

  async function skipForward() {
    await seekTo(position + 10);
  }

  async function skipBackward() {
    await seekTo(position - 10);
  }

  function handleProgressPress(event: any) {
    if (!videoRef.current || duration === 0 || progressBarWidth.current === 0) return;
    const { locationX } = event.nativeEvent;
    const ratio = Math.max(0, Math.min(1, locationX / progressBarWidth.current));
    const newPosition = ratio * duration;
    setIsSeeking(true);
    seekTo(newPosition);
    setTimeout(() => setIsSeeking(false), 300);
  }

  function next() {
    if (selectedIndex === null || assets.length === 0) return;
    const nextIdx = (selectedIndex + 1) % assets.length;
    playIndex(nextIdx);
  }

  function prev() {
    if (selectedIndex === null || assets.length === 0) return;
    const prevIdx = selectedIndex <= 0 ? assets.length - 1 : selectedIndex - 1;
    playIndex(prevIdx);
  }

  async function togglePlayPause() {
    if (!videoRef.current) return;
    try {
      const status = await videoRef.current.getStatusAsync();
      if (!status.isLoaded) return;
      if (status.isPlaying) {
        await videoRef.current.pauseAsync();
        setIsPlaying(false);
      } else {
        await videoRef.current.playAsync();
        setIsPlaying(true);
      }
    } catch {}
  }

  if (loading) {
    return (
      <ThemedView style={styles.center}>
        <ActivityIndicator />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={styles.container}> 
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Galeria de Vídeos</Text>
        <Pressable
          onPress={() => router.push('/')}
          accessibilityLabel="Abrir player de música"
          style={styles.headerIconWrap}
        >
          <IconSymbol name="play.fill" size={28} color="#fff" />
        </Pressable>
      </View>

      {(selectedIndex !== null || playingUri) ? (
        <View style={styles.playerWrap}>
          <Video
            ref={videoRef}
            style={styles.video}
            useNativeControls={false}
            onPlaybackStatusUpdate={(status) => {
              const s = status as any;
              if (s?.isLoaded) {
                setIsPlaying(Boolean(s?.isPlaying));
                if (!isSeeking) {
                  setPosition(s?.positionMillis / 1000 || 0);
                  setDuration(s?.durationMillis / 1000 || 0);
                }
                if (s?.didJustFinish && selectedIndex !== null) next();
              }
            }}
          />

          {selectedThumb ? (
            <View style={styles.thumbPreviewWrap}>
              <Image source={{ uri: selectedThumb }} style={styles.thumbPreview} />
            </View>
          ) : null}

          {/* Progress Bar */}
          <View style={styles.progressContainer}>
            <Text style={styles.timeText}>{formatTime(position)}</Text>
            <Pressable 
              style={styles.progressBarWrapper} 
              onPress={handleProgressPress}
              onLayout={(e) => {
                progressBarWidth.current = e.nativeEvent.layout.width;
              }}
            >
              <View style={styles.progressBarBackground}>
                <View 
                  style={[
                    styles.progressBarFill, 
                    { width: `${duration > 0 ? (position / duration) * 100 : 0}%` }
                  ]} 
                />
              </View>
            </Pressable>
            <Text style={styles.timeText}>{formatTime(duration)}</Text>
          </View>

          <View style={styles.controlsRow}>
            <Pressable onPress={prev} style={styles.ctrlBtn} disabled={selectedIndex === null}>
              <IconSymbol name="chevron.left" size={24} color={selectedIndex === null ? "rgba(255,255,255,0.3)" : "#fff"} />
            </Pressable>

            <Pressable onPress={skipBackward} style={styles.skipBtn}>
              <IconSymbol name="gobackward.10" size={18} color="#fff" />
              <Text style={styles.skipText}>-10</Text>
            </Pressable>

            <Pressable onPress={togglePlayPause} style={[styles.ctrlBtn, styles.playBtn]}>
              <IconSymbol name={isPlaying ? 'pause.fill' : 'play.fill'} size={28} color="#000" />
            </Pressable>

            <Pressable onPress={skipForward} style={styles.skipBtn}>
              <IconSymbol name="goforward.10" size={18} color="#fff" />
              <Text style={styles.skipText}>+10</Text>
            </Pressable>

            <Pressable onPress={next} style={styles.ctrlBtn} disabled={selectedIndex === null}>
              <IconSymbol name="chevron.left" size={24} color={selectedIndex === null ? "rgba(255,255,255,0.3)" : "#fff"} style={{ transform: [{ rotate: '180deg' }] }} />
            </Pressable>
          </View>
          <View style={styles.playerActionsRow}>
            <Pressable style={styles.pickButton} onPress={pickVideoFile}>
              <Text style={{ color: '#fff' }}>Procurar no armazenamento</Text>
            </Pressable>
          </View>
        </View>
      ) : (
        <View style={styles.hintWrap}>
          <Text style={styles.hintText}>Toque em um vídeo abaixo para reproduzir</Text>
        </View>
      )}

      {/* Search Bar for Server Videos */}
      <View style={styles.searchContainer}>
        <TextInput
          style={styles.searchInput}
          placeholder="Buscar vídeos salvos..."
          placeholderTextColor="rgba(255,255,255,0.5)"
          value={searchQuery}
          onChangeText={(text) => {
            setSearchQuery(text);
            searchServerVideos(text);
          }}
        />
        {loadingServer && <ActivityIndicator size="small" color="#fff" style={{ marginLeft: 8 }} />}
      </View>

      {/* Server Videos List */}
      {serverVideos.length > 0 && (
        <View style={styles.serverVideosSection}>
          <Text style={styles.sectionTitle}>Vídeos Salvos</Text>
          <FlatList
            horizontal
            showsHorizontalScrollIndicator={false}
            data={serverVideos}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <Pressable style={styles.serverVideoItem} onPress={() => playServerVideo(item)}>
                {item.thumbnail ? (
                  <Image source={{ uri: item.thumbnail }} style={styles.serverVideoThumb} />
                ) : (
                  <View style={[styles.serverVideoThumb, styles.placeholderThumb]}>
                    <IconSymbol name="play.fill" size={24} color="rgba(255,255,255,0.5)" />
                  </View>
                )}
                <Text numberOfLines={2} style={styles.serverVideoTitle}>{item.title}</Text>
              </Pressable>
            )}
          />
        </View>
      )}

      <FlatList
        data={assets}
        keyExtractor={(i) => i.id}
        numColumns={2}
        renderItem={({ item, index }) => (
          <Pressable style={styles.assetItem} onPress={() => playIndex(index)}>
            <Image source={{ uri: item.uri }} style={styles.thumb} />
            <Text numberOfLines={1} style={styles.assetTitle}>{item.filename ?? 'Untitled'}</Text>
          </Pressable>
        )}
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    padding: 12,
    backgroundColor: '#000',
  },
  center: { 
    flex: 1, 
    alignItems: 'center', 
    justifyContent: 'center',
    backgroundColor: '#000',
  },
  header: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    justifyContent: 'space-between', 
    marginBottom: 16,
  },
  headerTitle: { 
    flex: 1,
    fontSize: 28,
    fontWeight: '700',
    color: '#fff',
  },
  headerIconWrap: { 
    padding: 8, 
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  playerWrap: { 
    marginBottom: 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 12,
    padding: 12,
  },
  video: { 
    width: '100%', 
    height: 220, 
    backgroundColor: '#000',
    borderRadius: 8,
  },
  progressContainer: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingHorizontal: 8, 
    paddingVertical: 12,
    gap: 8,
  },
  progressBarWrapper: { 
    flex: 1,
    paddingVertical: 8,
  },
  progressBarBackground: {
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#fff',
    borderRadius: 2,
  },
  timeText: { 
    fontSize: 12, 
    color: 'rgba(255,255,255,0.7)', 
    minWidth: 45, 
    textAlign: 'center',
    fontWeight: '500',
  },
  controlsRow: { 
    flexDirection: 'row', 
    justifyContent: 'center', 
    paddingVertical: 12, 
    alignItems: 'center',
    gap: 4,
  },
  ctrlBtn: { 
    padding: 12, 
    marginHorizontal: 4, 
    backgroundColor: 'rgba(255,255,255,0.1)', 
    borderRadius: 8,
  },
  playBtn: { 
    backgroundColor: '#fff',
    padding: 14,
  },
  skipBtn: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    padding: 10, 
    marginHorizontal: 4, 
    backgroundColor: 'rgba(255,255,255,0.1)', 
    borderRadius: 8,
    gap: 4,
  },
  skipText: { 
    fontSize: 12, 
    color: '#fff', 
    fontWeight: '600' 
  },
  hintWrap: { 
    padding: 20, 
    alignItems: 'center',
    marginBottom: 12,
  },
  hintText: {
    fontSize: 14,
    color: 'rgba(255,255,255,0.6)',
    textAlign: 'center',
  },
  assetItem: { 
    flex: 1 / 2, 
    padding: 6, 
    alignItems: 'center' 
  },
  thumb: { 
    width: '100%', 
    aspectRatio: 16 / 9, 
    borderRadius: 8, 
    backgroundColor: '#222' 
  },
  assetTitle: { 
    marginTop: 8, 
    fontSize: 13, 
    color: '#fff',
    textAlign: 'center',
    fontWeight: '500',
  },
  playerActionsRow: { 
    paddingHorizontal: 12, 
    alignItems: 'center', 
    marginTop: 12,
  },
  pickButton: { 
    paddingHorizontal: 20, 
    paddingVertical: 12, 
    backgroundColor: 'rgba(255,255,255,0.15)', 
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
  },
  thumbPreviewWrap: { 
    alignItems: 'center', 
    marginTop: 8,
    marginBottom: 8,
  },
  thumbPreview: { 
    width: 160, 
    height: 90, 
    borderRadius: 6, 
    backgroundColor: '#000' 
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  searchInput: {
    flex: 1,
    borderWidth: 2,
    borderColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    backgroundColor: 'rgba(255,255,255,0.1)',
    color: '#fff',
  },
  serverVideosSection: {
    marginBottom: 16,
  },
  sectionTitle: {
    marginBottom: 12,
    paddingHorizontal: 4,
    fontSize: 18,
    fontWeight: '600',
    color: '#fff',
  },
  serverVideoItem: {
    width: 140,
    marginRight: 12,
    padding: 4,
  },
  serverVideoThumb: {
    width: '100%',
    aspectRatio: 16 / 9,
    borderRadius: 8,
    backgroundColor: '#222',
  },
  placeholderThumb: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#111',
  },
  serverVideoTitle: {
    marginTop: 8,
    fontSize: 12,
    color: '#fff',
    textAlign: 'center',
    fontWeight: '500',
  },
});
