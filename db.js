const SUPABASE_URL = 'https://rniicbymwbmdzudichhm.supabase.co';
const SUPABASE_KEY = 'sb_publishable_rqMSy5xGulCdFrXG7266nA_m8x4DYqP';

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
        const { error } = await getSupabase().from('users').insert([user]);
        if (error) throw error;
        return true;
    },

    async getUser(username) {
        const { data, error } = await getSupabase().from('users').select('*').eq('username', username).single();
        if (error && error.code !== 'PGRST116') throw error; // PGRST116 is 'no rows found'
        return data;
    },

    async getAllUsers() {
        const { data, error } = await getSupabase().from('users').select('*');
        if (error) throw error;
        return data;
    },

    async updateUser(user) {
        const { error } = await getSupabase().from('users').update(user).eq('username', user.username);
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

        const { error } = await getSupabase().from('users').update({ favorites }).eq('username', username);
        if (error) throw error;
        return favorites;
    }
};

// Song Operations
const SongDB = {
    async addSong(song, username) {
        const songWithUser = { ...song, username };
        const { error } = await getSupabase().from('songs').upsert([songWithUser]);
        if (error) throw error;
        return true;
    },

    async addSongs(songsArray, username) {
        const songsWithUser = songsArray.map(s => ({ ...s, username }));
        // Upsert 50 at a time to avoid heavy requests
        const chunkSize = 50;
        for (let i = 0; i < songsWithUser.length; i += chunkSize) {
            const chunk = songsWithUser.slice(i, i + chunkSize);
            const { error } = await getSupabase().from('songs').upsert(chunk);
            if (error) throw error;
        }
        return true;
    },

    async getSongsByUser(username) {
        const { data, error } = await getSupabase().from('songs').select('*').eq('username', username);
        if (error) throw error;
        return data;
    },

    async getAllSongs() {
        const { data, error } = await getSupabase().from('songs').select('*').order('created_at', { ascending: false });
        if (error) throw error;
        return data;
    },

    async deleteSong(id) {
        const { error } = await getSupabase().from('songs').delete().eq('id', id);
        if (error) throw error;
        return true;
    },

    async updateSong(song) {
        const { error } = await getSupabase().from('songs').update(song).eq('id', song.id);
        if (error) throw error;
        return true;
    },

    async getSongByUrl(url) {
        const { data, error } = await getSupabase().from('songs').select('*').eq('url', url).maybeSingle();
        if (error) throw error;
        return data;
    }
};

// Playlist Operations
const PlaylistDB = {
    async addPlaylist(playlist) {
        const { data, error } = await getSupabase().from('playlists').insert([playlist]).select().single();
        if (error) throw error;
        return data.id;
    },

    async getPlaylistsByUser(username) {
        const { data, error } = await getSupabase().from('playlists').select('*').eq('username', username);
        if (error) throw error;
        return data;
    },

    async addSongToPlaylist(playlistId, songId) {
        const { data: p, error: getErr } = await getSupabase().from('playlists').select('song_ids').eq('id', playlistId).single();
        if (getErr) throw getErr;

        let songIds = p.song_ids || [];
        if (!songIds.includes(songId)) {
            songIds.push(songId);
            const { error } = await getSupabase().from('playlists').update({ song_ids: songIds }).eq('id', playlistId);
            if (error) throw error;
        }
        return true;
    },

    async removeSongFromPlaylist(playlistId, songId) {
        const { data: p, error: getErr } = await getSupabase().from('playlists').select('song_ids').eq('id', playlistId).single();
        if (getErr) throw getErr;

        let songIds = (p.song_ids || []).filter(id => id !== songId);
        const { error } = await getSupabase().from('playlists').update({ song_ids: songIds }).eq('id', playlistId);
        if (error) throw error;
        return true;
    },

    async getPlaylistSongs(playlistId) {
        const { data: p, error: getErr } = await getSupabase().from('playlists').select('song_ids').eq('id', playlistId).single();
        if (getErr) throw getErr;

        if (!p || !p.song_ids || p.song_ids.length === 0) return [];

        const { data: songs, error: sErr } = await getSupabase().from('songs').select('*').in('id', p.song_ids);
        if (sErr) throw sErr;
        return songs;
    },

    async deletePlaylist(id) {
        const { error } = await getSupabase().from('playlists').delete().eq('id', id);
        if (error) throw error;
        return true;
    }
};

// Compatibility shim for older init code
function openDB() {
    return Promise.resolve(true);
}
