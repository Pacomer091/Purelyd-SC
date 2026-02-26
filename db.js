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
        const { error } = await getSupabase().from('sc_users').insert([user]);
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
        const { error } = await getSupabase().from('sc_users').update(user).eq('username', user.username);
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
        const songWithUser = { ...song, username };
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
        const { data, error } = await getSupabase().from('songs').select('*').eq('username', username);
        if (error) throw error;
        return data;
    }
};

// Playlist Operations
const PlaylistDB = {
    async addPlaylist(playlist) {
        const { data, error } = await getSupabase().from('sc_playlists').insert([playlist]).select().single();
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
