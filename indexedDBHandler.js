class IndexedDBHandler {
    constructor() {
        this.db = null;
        this.loadedFiles = {};
        this.loadedMessages = {};
        this.initDB();
    }

    async initDB() {
        return new Promise((resolve, reject) => {
            let request = indexedDB.open('chatDatabase', 1);

            request.onupgradeneeded = (event) => {
                this.db = event.target.result;
                if (!this.db.objectStoreNames.contains('files')) {
                    let fileStore = this.db.createObjectStore('files', { keyPath: 'hash' });
                    fileStore.createIndex('hash', 'hash', { unique: true });
                }
                if (!this.db.objectStoreNames.contains('messages')) {
                    let messageStore = this.db.createObjectStore('messages', { keyPath: 'id', autoIncrement: true });
                    messageStore.createIndex('room', 'room', { unique: false });
                    messageStore.createIndex('hashIndex', 'hash', { unique: true });
                }
            };

            request.onsuccess = (event) => {
                this.db = event.target.result;
                resolve();
            };

            request.onerror = (event) => {
                reject(event.target.error);
            };
        });
    }

    async storeFile(hash, data) {
        let transaction = this.db.transaction(['files'], 'readwrite');
        let objectStore = transaction.objectStore('files');
        objectStore.put({ hash: hash, data: data });
        this.loadedFiles[hash] = data;
    }

    async getFile(hash) {
        return new Promise((resolve, reject) => {
            if (hash in this.loadedFiles) {
                resolve(this.loadedFiles[hash]);
            } else {
                let transaction = this.db.transaction(['files'], 'readonly');
                let objectStore = transaction.objectStore('files');
                let request = objectStore.get(hash);

                request.onsuccess = (event) => {
                    let file = event.target.result;
                    if (file) {
                        this.loadedFiles[hash] = file.data;
                        resolve(file.data);
                    } else {
                        resolve(null);
                    }
                };

                request.onerror = (event) => {
                    reject(event.target.error);
                };
            }
        });
    }

    async storeMessage(room, message) {
        const messageHash = message.hash;

        const messageExists = await this.messageExists(messageHash);
        if (!messageExists) {
            let transaction = this.db.transaction(['messages'], 'readwrite');
            let objectStore = transaction.objectStore('messages');
            objectStore.add({ room: room, message: message.message, timestamp: message.timestamp, hash: messageHash, peerInfo: message.peerInfo, sent: message.sent });
            if (!this.loadedMessages[room]) {
                this.loadedMessages[room] = [];
            }
            this.loadedMessages[room].push(message);
        }
    }

    async getMessages(room) {
        return new Promise((resolve, reject) => {
            if (room in this.loadedMessages) {
                resolve(this.loadedMessages[room]);
            } else {
                let transaction = this.db.transaction(['messages'], 'readonly');
                let objectStore = transaction.objectStore('messages');
                let index = objectStore.index('room');
                let request = index.getAll(room);

                request.onsuccess = (event) => {
                    this.loadedMessages[room] = event.target.result.map(entry => entry.message);
                    resolve(this.loadedMessages[room]);
                };

                request.onerror = (event) => {
                    reject(event.target.error);
                };
            }
        });
    }

    async getMessagesBatch(room, start, batchSize) {
        return new Promise((resolve, reject) => {
            let transaction = this.db.transaction(['messages'], 'readonly');
            let objectStore = transaction.objectStore('messages');
            let index = objectStore.index('room');
            let range = IDBKeyRange.only(room);
            let request = index.openCursor(range, 'prev'); // Fetch in reverse order

            let messages = [];
            let count = 0;

            request.onsuccess = (event) => {
                let cursor = event.target.result;
                if (cursor && count < start + batchSize) {
                    if (count >= start) {
                        messages.push(cursor.value);
                    }
                    count++;
                    cursor.continue();
                } else {
                    // Reverse the messages to maintain chronological order
                    resolve(messages.reverse());
                }
            };

            request.onerror = (event) => {
                reject(event.target.error);
            };
        });
    }

    async messageExists(hash) {
        return new Promise((resolve, reject) => {
            console.log("hash indexdb",hash)
            let transaction = this.db.transaction(['messages'], 'readonly');
            let objectStore = transaction.objectStore('messages');
            let index = objectStore.index('hashIndex');
            let request = index.get(hash);

            request.onsuccess = (event) => {
                resolve(!!event.target.result);
            };

            request.onerror = (event) => {
                reject(event.target.error);
            };
        });
    }
}

export default new IndexedDBHandler();
