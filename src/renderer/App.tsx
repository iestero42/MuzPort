// En: src/renderer/App.tsx

import React, { useState, useMemo, useEffect, CSSProperties } from 'react';
import './App.css';

// Un tipo simple para nuestras canciones (si usas TypeScript)
type Track = {
  artist: string;
  title: string;
  genre: string;
  year: number | null;
  path: string;
};

type AppRowProps = {
  tracks: Track[];
  onPreview: (path: string) => void;
  onEdit: (track: Track) => void;
  onRemove: (path: string) => void;
};

type ManualRowComponentProps = AppRowProps & {
  index: number;
  style: CSSProperties; // El tipo que acabamos de importar de React
};

function RowComponent({
  index,
  style,
  tracks,
  onPreview,
  onEdit,
  onRemove,
}: ManualRowComponentProps) {

  // Obtenemos la canción correcta del array
  const track = tracks[index];

  return (
    // El 'style' (para la posición) viene de react-window
    <li style={style} key={track.path} className="list-item">

      <div className="track-info">
        <strong>{track.title}</strong>
        <small>{track.artist} // {track.genre} // {track.year || 'N/A'}</small>
      </div>

      <div className="track-actions">
        <button
          className="button-preview"
          title="Escuchar este archivo"
          onClick={() => onPreview(track.path)}
        >
          ▶️
        </button>
        <button
          className="button-edit"
          title="Editar esta canción"
          onClick={() => onEdit(track)}
        >
          ✏️
        </button>
        <button 
          className="button-remove" 
          title="Quitar de la lista"
          onClick={() => onRemove(track.path)}
        >
          &times;
        </button>
      </div>

    </li>
  );
}

export default function App() {
  const [ListComponent, setListComponent] = useState<React.ComponentType<any> | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [allTracks, setAllTracks] = useState<Track[]>([]);
  const [playlistName, setPlaylistName] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [removedPaths, setRemovedPaths] = useState<string[]>([]);
  const [filterArtist, setFilterArtist] = useState('');
  const [filterGenre, setFilterGenre] = useState('');
  const [filterYear, setFilterYear] = useState('');
  const [editingTrack, setEditingTrack] = useState<Track | null>(null);
  const [editForm, setEditForm] = useState({ title: '', artist: '' });

  useEffect(() => {
    let mounted = true; // Para evitar 'memory leaks'

    // Usamos el import() dinámico que nos sugirió el error
    import('react-window')
      .then(module => {
        if (mounted && module.List) {
          // ¡Éxito! Guardamos el componente 'List' en nuestro estado
          setListComponent(() => module.List);
        } else if (mounted) {
          console.error("Error: 'List' no se encontró en el módulo 'react-window'.");
        }
      })
      .catch(err => {
        console.error("Error al cargar dinámicamente 'react-window':", err);
        alert("Error crítico al cargar la lista. Revisa la consola.");
      });

    return () => { mounted = false; };
  }, []);
  const filteredTracks = useMemo(() => {
    // Empezamos con todas las canciones
    let tracks = [...allTracks];

    // Filtramos por artista (si hay algo escrito)
    if (filterArtist.trim() !== '') {
      tracks = tracks.filter(track => 
        track.artist.toLowerCase().includes(filterArtist.toLowerCase())
      );
    }

    // Filtramos por género (si hay algo escrito)
    if (filterGenre.trim() !== '') {
      tracks = tracks.filter(track =>
        track.genre.toLowerCase().includes(filterGenre.toLowerCase())
      );
    }

    // Filtramos por año (si hay un número válido escrito)
    const yearNum = parseInt(filterYear, 10);
    if (!isNaN(yearNum)) {
      tracks = tracks.filter(track => track.year === yearNum);
    }

    tracks = tracks.filter(track => !removedPaths.includes(track.path));

    return tracks;
  }, [allTracks, filterArtist, filterGenre, filterYear]);

  const handleRemoveTrack = (pathToRemove: string) => {
    // Añade la ruta del archivo a la lista de "eliminados"
    setRemovedPaths(currentPaths => [...currentPaths, pathToRemove]);
  };

  const handleEditTrack = (trackToEdit: Track) => {
    // 1. Guardamos la canción que el usuario quiere editar
    setEditingTrack(trackToEdit);

    // 2. Pre-rellenamos el formulario con los datos actuales
    setEditForm({
      title: trackToEdit.title,
      artist: trackToEdit.artist,
    });
  };

  const handleCloseModal = () => {
    setEditingTrack(null);
  };

  const handleSaveEdit = () => {
    if (!editingTrack) return; // No debería pasar, pero por si acaso

    // 1. Actualizamos el estado 'allTracks'
    setAllTracks(currentTracks =>
      currentTracks.map(track => {
        // Si esta es la canción que editamos...
        if (track.path === editingTrack.path) {
          // ...devolvemos un objeto NUEVO con los datos del formulario
          return {
            ...track,
            title: editForm.title,
            artist: editForm.artist,
          };
        }
        // Si no, la devolvemos como estaba
        return track;
      })
    );

    // 2. Cerramos el modal
    handleCloseModal();
  };

  // Función 'helper' para actualizar el formulario del modal
  const handleFormChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEditForm({
      ...editForm,
      [e.target.name]: e.target.value,
    });
  };

  const handleConnectSpotify = async () => {
    console.log('Iniciando conexión con Spotify...');
    setIsLoading(true); // Bloqueamos los botones

    try {
      // Llamamos al 'puente' que escucha el canal 'spotify:login'
      await window.electron.ipcRenderer.invoke('spotify:login');

      // Si la promesa se resuelve, ¡estamos conectados!
      setIsConnected(true);
      console.log('¡Conectado a Spotify!');

    } catch (error) {
      console.error('Error al conectar con Spotify:', error);
      alert('Hubo un error al conectar. Revisa la consola.');
    } finally {
      setIsLoading(false); // Desbloqueamos los botones
    }
  };

  const handleOpenFolder = async () => {
    console.log('Pidiendo al proceso Main que abra y procese la carpeta...');
    setIsLoading(true); // Empezamos a cargar
    setAllTracks([]); // Limpiamos las canciones anteriores

    try {
      // 1. Llama al "puente" que creamos.
      // 'process-folder' es el 'canal' que escucha nuestro main.ts
      const loadedTracks: Track[] = await window.electron.ipcRenderer.invoke('process-folder');

      if (!loadedTracks || loadedTracks.length === 0) {
        console.log('El proceso Main no devolvió canciones.');
        alert('No se encontraron archivos de música en esa carpeta.');
      } else {
        console.log('¡Recibidas canciones del proceso Main!', loadedTracks);
        setAllTracks(loadedTracks);// ¡Guardamos las canciones en el estado!
        setRemovedPaths([]);
      }

    } catch (err) {
      console.error('Error al invocar "process-folder":', err);
      alert('Ocurrió un error al leer la carpeta. Revisa la consola.');
    } finally {
      setIsLoading(false); // Terminamos de cargar
    }
  };

  const handlePreviewTrack = (filePath: string) => {
    // Llama al 'puente' que creamos en main.ts
    window.electron.ipcRenderer.invoke('shell:open-file', filePath);
  };

  const handleCreatePlaylist = async () => {
    if (!canCreatePlaylist) return;

    console.log(`Iniciando creación de playlist: ${playlistName}`);
    setIsLoading(true); // Bloqueamos la UI
    setRemovedPaths([]);

    try {
      // 1. Pasamos el nombre y la lista de canciones al 'main'
      const newPlaylistUrl = await window.electron.ipcRenderer.invoke(
        'spotify:create-playlist', playlistName, filteredTracks
      );

      // 2. ¡Éxito!
      alert(`¡Playlist "${playlistName}" creada con éxito!\n\nPuedes verla en:\n${newPlaylistUrl}`);

      // Reseteamos el estado
      setAllTracks([]); // Reemplaza setTracks([])
      setPlaylistName('');
      setFilterArtist('');
      setFilterGenre('');
      setFilterYear('');

    } catch (error) {
      console.error('Error al crear la playlist:', error);
      alert(`Ocurrió un error al crear la playlist. Revisa la consola.\n\n${error}`);
    } finally {
      setIsLoading(false); // Desbloqueamos la UI
    }
  };

  // --- Variables de estado derivado ---
  const canCreatePlaylist = isConnected && filteredTracks.length > 0 && playlistName.trim() !== '';

  return (
    <div className="container">
      <header className="header">
        <h1>MUZPORT 🎵</h1>
        <p>Crea playlists desde tus carpetas locales.</p>
      </header>

      <div className="step">
        <h2>Conectar</h2>
        {isConnected ? (
          <p className="status-success">✅ Conectado a Spotify</p>
        ) : (
          <button 
            onClick={handleConnectSpotify} 
            className="button-spotify"
            disabled={isLoading}
          >
            Conectar con Spotify
          </button>
        )}
      </div>

      <div className="step">
        <h2>Cargar Música</h2>
        <button 
          onClick={handleOpenFolder} 
          className="button-secondary"
          disabled={isLoading} // Desactivado mientras carga
        >
          {isLoading ? 'Escaneando (sim)...' : 'Abrir Carpeta de Música'}
        </button>
      </div>

      <div className="step">
        <h2>Filtrar Canciones</h2>
        <p>Encontradas {allTracks.length} canciones. 
          Filtradas: <strong>{filteredTracks.length}</strong>
        </p>

        <div className="filter-grid">
          <input
            type="text"
            placeholder="Filtrar por Artista..."
            className="input-filter"
            value={filterArtist}
            onChange={(e) => setFilterArtist(e.target.value)}
          />
          <input
            type="text"
            placeholder="Filtrar por Género..."
            className="input-filter"
            value={filterGenre}
            onChange={(e) => setFilterGenre(e.target.value)}
          />
          <input
            type="number"
            placeholder="Filtrar por Año (ej. 1995)"
            className="input-filter"
            value={filterYear}
            onChange={(e) => setFilterYear(e.target.value)}
          />
        </div>

        <div className="track-list-detailed">
           {ListComponent ? (
            <ListComponent // <-- ¡Renderizamos el componente desde el estado!
              height={200}
              rowCount={filteredTracks.length}
              rowHeight={60}
              rowComponent={RowComponent} // Tu componente de fila (RowComponent)
              width="100%"
              rowProps={{
                tracks: filteredTracks,
                onPreview: handlePreviewTrack,
                onEdit: handleEditTrack,
                onRemove: handleRemoveTrack,
              }}
            />
          ) : (
            /* 2. Si el componente AÚN NO se ha cargado... */
            <li className="list-item-empty">Cargando lista...</li>
          )}

          {/* Mensaje de 'no hay canciones' */}
          {ListComponent && filteredTracks.length === 0 && allTracks.length > 0 && (
            <li className="list-item-empty">¡Ninguna canción coincide con tu filtro!</li>
          )}
        </div>
      </div>

      <div className="step">
        <h2>Crear Playlist</h2>
        <input
          type="text"
          placeholder="Nombre de la nueva playlist"
          className="input-playlist"
          value={playlistName}
          onChange={(e) => setPlaylistName(e.target.value)}
          disabled={!isConnected || isLoading} // Desactivado
        />
        <button
          onClick={handleCreatePlaylist}
          className="button-primary"
          disabled={!canCreatePlaylist || isLoading} // Desactivado
        >
          Crear Playlist
        </button>
      </div>

      {editingTrack && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>

            <h2>Editar Canción</h2>

            <div className="form-group">
              <label htmlFor="title">Título</label>
              <input
                type="text"
                id="title"
                name="title"
                className="input-modal"
                value={editForm.title}
                onChange={handleFormChange}
              />
            </div>

            <div className="form-group">
              <label htmlFor="artist">Artista</label>
              <input
                type="text"
                id="artist"
                name="artist"
                className="input-modal"
                value={editForm.artist}
                onChange={handleFormChange}
              />
            </div>

            <div className="modal-actions">
              <button
                className="button-secondary" // Reusamos el estilo cian
                onClick={handleCloseModal}
              >
                Cancelar
              </button>
              <button
                className="button-primary" // Reusamos el estilo rosa
                onClick={handleSaveEdit}
              >
                Guardar Cambios
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
