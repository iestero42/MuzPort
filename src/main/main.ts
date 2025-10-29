/* eslint global-require: off, no-console: off, promise/always-return: off */

/**
 * This module executes inside of electron's main process. You can start
 * electron renderer process from here and communicate with the other processes
 * through IPC.
 *
 * When running `npm run build` or `npm run build:main`, this file is compiled to
 * `./src/main.js` using webpack. This gives us some performance wins.
 */
import path from 'path';
import { autoUpdater } from 'electron-updater';
import log from 'electron-log';
import MenuBuilder from './menu';
import { resolveHtmlPath } from './util';
import { glob } from 'glob';
import SpotifyWebApi from 'spotify-web-api-node';
import http from 'http';
import url from 'url';
import { app, BrowserWindow, shell, ipcMain, dialog } from 'electron';
import { exec } from 'child_process';
import dotenv from 'dotenv';

class AppUpdater {
  constructor() {
    log.transports.file.level = 'info';
    autoUpdater.logger = log;
    autoUpdater.checkForUpdatesAndNotify();
  }
}

let mainWindow: BrowserWindow | null = null;

ipcMain.on('ipc-example', async (event, arg) => {
  const msgTemplate = (pingPong: string) => `IPC test: ${pingPong}`;
  console.log(msgTemplate(arg));
  event.reply('ipc-example', msgTemplate('pong'));
});

dotenv.config();

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;
const REDIRECT_URI = 'http://127.0.0.1:1234/callback';

// Definimos los permisos que necesitamos
const scopes = [
  'playlist-modify-public',
  'playlist-modify-private',
];

// Creamos la instancia de la API
const spotifyApi = new SpotifyWebApi({
  clientId: CLIENT_ID,
  clientSecret: CLIENT_SECRET,
  redirectUri: REDIRECT_URI,
});

// Guardaremos el token aquí (en una app real, usarías 'electron-store' para guardarlo de forma segura)
let accessToken: string | null = null;
let refreshToken: string | null = null;

ipcMain.handle('spotify:login', () => {
  // Esta función devuelve una Promesa que se resolverá cuando el login termine
  return new Promise((resolve, reject) => {
    // 1. Generamos la URL de autorización
    const authUrl = spotifyApi.createAuthorizeURL(scopes, 'some-state');

    // 2. Creamos un servidor web temporal en localhost:1234
    const server = http.createServer(async (req, res) => {
        if (!req.url) {
          res.end('Error');
          return;
        }

        // 3. Esperamos a que Spotify nos redirija a /callback
        const query = url.parse(req.url, true).query;
        if (query.code) {
          // Escribimos una respuesta bonita al navegador
          res.end('<h1>¡Autenticación exitosa!</h1><p>Puedes cerrar esta pestaña y volver a MUZPORT.</p>');

          // 4. Cerramos el servidor, ya no lo necesitamos
          server.close();

          try {
            // 5. Intercambiamos el 'code' por un token de acceso
            const data = await spotifyApi.authorizationCodeGrant(query.code as string);

            accessToken = data.body['access_token'];
            refreshToken = data.body['refresh_token'];

            // Le damos el token a nuestra instancia de la API
            spotifyApi.setAccessToken(accessToken);
            spotifyApi.setRefreshToken(refreshToken);

            console.log('¡Token de Spotify obtenido con éxito!');
            // 6. Resolvemos la promesa, avisando a React que todo salió bien
            resolve({ success: true });

          } catch (error) {
            console.error('Error al obtener el token:', error);
            reject(error);
          }
        }
      })
      .listen(1234, '0.0.0.0', () => {
        console.log('Servidor de autenticación temporal corriendo en http://0.0.0.0:1234');
      }); // El servidor escucha en el puerto 1234

    // 7. Abrimos el navegador del usuario en la URL de autorización
    shell.openExternal(authUrl);
  });
});

ipcMain.handle('spotify:create-playlist', async (event, playlistName, tracks) => {
  // 1. Comprobamos si tenemos un token
  if (!accessToken) {
    throw new Error('No estás conectado a Spotify.');
  }

  try {
    // --- Refrescar el token por si ha caducado ---
    // (En una app real, comprobarías la caducidad, pero refrescarlo 
    // cada vez es más simple y robusto para este proyecto)
    const data = await spotifyApi.refreshAccessToken();
    accessToken = data.body['access_token'];
    spotifyApi.setAccessToken(accessToken);
    console.log('Token refrescado con éxito.');
    // --- Fin de refresco ---

    // 2. Crear la playlist vacía
    const playlistData = await spotifyApi.createPlaylist(playlistName, {
      description: 'Playlist creada con MUZPORT',
      public: false, // Puedes cambiarlo a 'true' si quieres
    });

    const playlistId = playlistData.body.id;
    const playlistUrl = playlistData.body.external_urls.spotify;
    console.log(`Playlist creada con ID: ${playlistId}`);

    // 3. Buscar cada canción y obtener su URI de Spotify
    const trackUris: string[] = [];

    // Usamos un bucle 'for...of' para poder usar 'await' dentro
    for (const track of tracks) {
      const query = `track:${track.title} artist:${track.artist}`;
      try {
        const searchData = await spotifyApi.searchTracks(query, { limit: 1 });

        if (searchData.body.tracks && searchData.body.tracks.items.length > 0) {
          trackUris.push(searchData.body.tracks.items[0].uri);
        } else {
          console.warn(`No se encontró: ${track.artist} - ${track.title}`);
        }
      } catch (searchErr) {
        console.error(`Error buscando: ${query}`, searchErr);
      }
    }

    console.log(`Encontradas ${trackUris.length} URIs de canciones.`);

    // 4. Añadir las canciones a la playlist (en bloques de 100)
    // Spotify solo permite añadir 100 canciones por petición
    for (let i = 0; i < trackUris.length; i += 100) {
      const chunk = trackUris.slice(i, i + 100);
      await spotifyApi.addTracksToPlaylist(playlistId, chunk);
      console.log(`Añadido bloque de ${chunk.length} canciones.`);
    }

    // 5. Devolver la URL de la nueva playlist a React
    return playlistUrl;

  } catch (error) {
    console.error('Error al crear la playlist o añadir canciones:', error);
    throw new Error('Error al crear la playlist.');
  }
});

ipcMain.handle('shell:open-file', async (event, filePath) => {
  console.log(`Pidiendo a WSL que abra: ${filePath}`);

  // 'shell.openExternal' falla, así que usamos 'wslview' directamente.
  // 'wslview' es parte de 'wslutilities' y SÍ sabe cómo
  // traducir /mnt/f/... a F:\... y pasárselo a Windows.

  const command = `wslview "${filePath}"`;

  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`Error al ejecutar wslview: ${error.message}`);
        reject(error);
        return;
      }
      if (stderr) {
        console.warn(`wslview stderr: ${stderr}`);
      }
      resolve(stdout);
    });
  });
});

ipcMain.handle('process-folder', async () => {
  // 1. Abrir el diálogo nativo para elegir carpeta
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openDirectory'],
  });

  // Si el usuario canceló, devolvemos un array vacío
  if (canceled || !filePaths || filePaths.length === 0) {
    console.log('El usuario canceló la selección');
    return [];
  }

  const folderPath = filePaths[0];
  console.log(`Carpeta seleccionada: ${folderPath}`);

  try {
    // 2. Buscar todos los archivos de música
    // Usamos path.posix.join para asegurar 'forward slashes' (/) que glob necesita
    const pattern = `${folderPath.replace(/\\/g, '/')}/**/*.{mp3,flac,m4a}`;
    const files = await glob(pattern, { nodir: true });
    console.log(`Encontrados ${files.length} archivos de música.`);

    if (files.length === 0) {
      return [];
    }

    // 3. Importar dinámicamente music-metadata (es un módulo ESM)
    const musicMetadata = await import('music-metadata');

    // 4. Leer los metadatos de cada archivo
    const loadedTracks = [];
    for (const file of files) {
      try {
        const metadata = await musicMetadata.parseFile(file);

        // El género suele ser un array (ej. ['Rock']), así que cogemos el primero.
        const genre = metadata.common.genre && metadata.common.genre.length > 0 
                      ? metadata.common.genre[0] 
                      : 'Desconocido';

        loadedTracks.push({
          artist: metadata.common.artist || 'Artista Desconocido',
          title: metadata.common.title || 'Título Desconocido',
          genre: genre,
          year: metadata.common.year || null,
          path: file,
        });
      } catch (error) {
        console.warn(`No se pudo leer metadata de: ${file}`, error);
      }
    }

    console.log('Metadatos cargados, devolviendo al renderer.');
    return loadedTracks; // ¡Devolvemos la lista de canciones!
  } catch (err) {
    console.error('Error al procesar la carpeta en main:', err);
    return []; // Devuelve vacío en caso de error
  }
});

if (process.env.NODE_ENV === 'production') {
  const sourceMapSupport = require('source-map-support');
  sourceMapSupport.install();
}

const isDebug =
  process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';

if (isDebug) {
  require('electron-debug').default();
}

const installExtensions = async () => {
  const installer = require('electron-devtools-installer');
  const forceDownload = !!process.env.UPGRADE_EXTENSIONS;
  const extensions = ['REACT_DEVELOPER_TOOLS'];

  return installer
    .default(
      extensions.map((name) => installer[name]),
      forceDownload,
    )
    .catch(console.log);
};

const createWindow = async () => {
  if (isDebug) {
    await installExtensions();
  }

  const RESOURCES_PATH = app.isPackaged
    ? path.join(process.resourcesPath, 'assets')
    : path.join(__dirname, '../../assets');

  const getAssetPath = (...paths: string[]): string => {
    return path.join(RESOURCES_PATH, ...paths);
  };

  mainWindow = new BrowserWindow({
    show: false,
    width: 1024,
    height: 728,
    icon: getAssetPath('icon.png'),
    webPreferences: {
      preload: app.isPackaged
        ? path.join(__dirname, 'preload.js')
        : path.join(__dirname, '../../.erb/dll/preload.js'),
    },
  });

  mainWindow.loadURL(resolveHtmlPath('index.html'));

  mainWindow.on('ready-to-show', () => {
    if (!mainWindow) {
      throw new Error('"mainWindow" is not defined');
    }
    if (process.env.START_MINIMIZED) {
      mainWindow.minimize();
    } else {
      mainWindow.show();
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  const menuBuilder = new MenuBuilder(mainWindow);
  menuBuilder.buildMenu();

  // Open urls in the user's browser
  mainWindow.webContents.setWindowOpenHandler((edata) => {
    shell.openExternal(edata.url);
    return { action: 'deny' };
  });

  // Remove this if your app does not use auto updates
  // eslint-disable-next-line
  new AppUpdater();
};

/**
 * Add event listeners...
 */

app.on('window-all-closed', () => {
  // Respect the OSX convention of having the application in memory even
  // after all windows have been closed
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app
  .whenReady()
  .then(() => {
    createWindow();
    app.on('activate', () => {
      // On macOS it's common to re-create a window in the app when the
      // dock icon is clicked and there are no other windows open.
      if (mainWindow === null) createWindow();
    });
  })
  .catch(console.log);
