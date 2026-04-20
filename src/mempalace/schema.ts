import { Database } from 'bun:sqlite';

/**
 * Initializes the MemPalace Spatial Database Graph.
 * Employs the Wings, Rooms, and Drawers metaphor to ensure 100%
 * persistent context retrieval without token rot.
 */
export function initMemPalace(dbPath: string = 'mempalace.sqlite'): Database {
    const db = new Database(dbPath, { create: true });

    db.run(`
        CREATE TABLE IF NOT EXISTS wings (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT UNIQUE NOT NULL,
            description TEXT
        );
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS rooms (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            wing_id INTEGER,
            topic TEXT NOT NULL,
            l1_summary TEXT, -- L1 Context: Always loaded in prompt
            FOREIGN KEY(wing_id) REFERENCES wings(id)
        );
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS drawers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            room_id INTEGER,
            content TEXT NOT NULL,
            aaak_compressed TEXT, -- L3 Context: Deep storage for exact recall
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY(room_id) REFERENCES rooms(id)
        );
    `);

    return db;
}
