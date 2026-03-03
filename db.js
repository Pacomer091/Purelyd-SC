const SUPABASE_URL = 'https://kwyzikmhshvsvrtbfiea.supabase.co';
const SUPABASE_KEY = 'sb_publishable_T4fGDg_5Xhw9uaF8WSEsnA_jlCVSAtB';

let supabaseClient;
function getSupabase() {
    if (!supabaseClient) {
        if (typeof supabase === 'undefined') {
            throw new Error("Supabase library not loaded yet.");
        }
        supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    }
    return supabaseClient;
}

// User Operations
const UserDB = {
    async addUser(user) {
        // Sanitize object for Supabase to prevent schema cache errors with extra properties
        // Generate a UUID locally in case the live Supabase SQL schema is missing the uuid_generate_v4() default
        const dbUser = {
            id: crypto.randomUUID(),
            username: user.username,
            password: user.password,
            favorites: user.favorites || []
        };
        const { error } = await getSupabase().from('sc_users').insert([dbUser]);
        if (error) throw error;
        return true;
    },

    async getUser(username) {
        const { data, error } = await getSupabase().from('sc_users').select('*').eq('username', username).single();
        if (error && error.code !== 'PGRST116') throw error; // PGRST116 is 'no rows found'
        return data;
    },

    async getAllUsers() {
        const { data, error } = await getSupabase().from('sc_users').select('*');
        if (error) throw error;
        return data;
    },

    async updateUser(user) {
        // Sanitize object for Supabase to prevent schema cache errors with extra properties
        const dbUser = { username: user.username, password: user.password, favorites: user.favorites || [] };
        const { error } = await getSupabase().from('sc_users').update(dbUser).eq('username', user.username);
        if (error) throw error;
        return true;
    },

    async toggleFavorite(username, songId) {
        const user = await this.getUser(username);
        if (!user) throw new Error("User not found");

        let favorites = user.favorites || [];
        const index = favorites.indexOf(songId);

        if (index === -1) {
            favorites.push(songId);
        } else {
            favorites.splice(index, 1);
        }

        const { error } = await getSupabase().from('sc_users').update({ favorites }).eq('username', username);
        if (error) throw error;
        return favorites;
    }
};

// Song Operations
const SongDB = {
    async addSong(song, username) {
        // Aseguramos que siempre hay un id antes del upsert
        const songWithUser = {
            id: song.id ?? crypto.randomUUID(),
            ...song,
            username
        };
        const { error } = await getSupabase().from('sc_songs').upsert([songWithUser]);
        if (error) throw error;
        return true;
    },

    async getSongsByUser(username) {
        const { data, error } = await getSupabase().from('sc_songs').select('*').eq('username', username);
        if (error) throw error;
        return data; // Changed from 'songs' to 'sc_songs' to isolate SoundCloud Library
    },

    async getAllSongs() {
        const { data, error } = await getSupabase().from('sc_songs').select('*').order('created_at', { ascending: false });
        // NOTE: In an ideal scenario, if sc_songs is empty for the user, we would pull from 'songs' and migrate. We handle this in main.js.
        if (error) throw error;
        return data;
    },

    async deleteSong(id) {
        const { error } = await getSupabase().from('sc_songs').delete().eq('id', id);
        if (error) throw error;
        return true;
    },

    async updateSong(song) {
        const { error } = await getSupabase().from('sc_songs').update(song).eq('id', song.id);
        if (error) throw error;
        return true;
    },

    // Original DB fallback for migration
    async getLegacySongsByUser(username) {
        try {
            const { data, error } = await getSupabase().from('songs').select('*').eq('username', username);
            if (error) {
                if (error.code === 'PGRST116' || error.message.includes('relation "public.songs" does not exist')) return [];
                throw error;
            }
            return data;
        } catch (e) {
            console.warn("[Migration] Legacy songs table not found, skipping.");
            return [];
        }
    }
};

// Playlist Operations
const PlaylistDB = {
    async addPlaylist(playlist) {
        // Generamos el id en el cliente porque la tabla no tiene default
        const playlistWithId = { id: crypto.randomUUID(), ...playlist };
        const { data, error } = await getSupabase().from('sc_playlists').insert([playlistWithId]).select().single();
        if (error) throw error;
        return data.id;
    },

    async getPlaylistsByUser(username) {
        const { data, error } = await getSupabase().from('sc_playlists').select('*').eq('username', username);
        if (error) throw error;
        return data;
    },

    async addSongToPlaylist(playlistId, songId) {
        const { data: p, error: getErr } = await getSupabase().from('sc_playlists').select('song_ids').eq('id', playlistId).single();
        if (getErr) throw getErr;

        let songIds = p.song_ids || [];
        if (!songIds.includes(songId)) {
            songIds.push(songId);
            const { error } = await getSupabase().from('sc_playlists').update({ song_ids: songIds }).eq('id', playlistId);
            if (error) throw error;
        }
        return true;
    },

    async removeSongFromPlaylist(playlistId, songId) {
        const { data: p, error: getErr } = await getSupabase().from('sc_playlists').select('song_ids').eq('id', playlistId).single();
        if (getErr) throw getErr;

        let songIds = (p.song_ids || []).filter(id => id !== songId);
        const { error } = await getSupabase().from('sc_playlists').update({ song_ids: songIds }).eq('id', playlistId);
        if (error) throw error;
        return true;
    },

    async getPlaylistSongs(playlistId) {
        const { data: p, error: getErr } = await getSupabase().from('sc_playlists').select('song_ids').eq('id', playlistId).single();
        if (getErr) throw getErr;

        if (!p || !p.song_ids || p.song_ids.length === 0) return [];

        const { data: songs, error: sErr } = await getSupabase().from('sc_songs').select('*').in('id', p.song_ids);
        if (sErr) throw sErr;
        return songs;
    },

    async deletePlaylist(id) {
        const { error } = await getSupabase().from('sc_playlists').delete().eq('id', id);
        if (error) throw error;
        return true;
    }
};

// Compatibility shim for older init code
function openDB() {
    return Promise.resolve(true);
}
