const crypto = require('crypto');
const https = require('https');

class CoCreateNotification {
    constructor(crud) {
        this.wsManager = crud.wsManager
        this.crud = crud
        this.newKeyMap = new Map()
        this.subscriptions = new Map()
        this.init();
    }

    init() {
        if (this.wsManager) {
            this.wsManager.on('notification.publicKey', (data) => this.publicKey(data));
            this.wsManager.on('notification.subscription', (data) => this.subscription(data));
            this.wsManager.on('notification.send', (data) => this.send(data));
        }
    }

    // Function to generate VAPID keys (public and private)
    publicKey(data) {
        let subscription = this.subscriptions.has(data.clientId)
        if (!subscription) {
            let newKeys = this.generateVapidKeys()
            this.newKeyMap.set(data.clientId, newKeys)
            data.publicKey = newKeyMap.publicKey
        } else {
            data.publicKey = subscription.publicKey
        }

        this.socket.send(data)

    }

    async subscription(data) {
        let newKeys = this.newKeyMap.get(data.clientId)
        if (newKeys) {
            this.newKeyMap.delete(data.clientId)
            this.subscriptions.set(data.clientId, { ...newKeys, ...data.subscription })
        } else {
            newKeys = this.subscriptions.get(data.clientId)
            if (newKeys) {
                newKeys = { ...newKeys, ...data.subscription }
            } else {
                newKeys = {}
            }
        }

        crud.send({
            method: 'update.object',
            array: 'keys',
            object: {
                ...data.subscription,
                ...newKeys
            }
        });

    };

    // Load the client's subscription object from storage
    send(data) {
        const key = crud.send({ array: 'keys', filter: { query: [{}] } });

        const subscription = key.object[0]
        if (!subscription || !subscription.privateKey)
            return

        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - subscription.rotateKeysIn || 90);

        // Compare the modification time with the cutoff date
        if (!this.newKeyMap.has(data.clientId) && subscription.privateKeyCreatedOn < cutoffDate) {
            let newKeys = this.generateVapidKeys()
            this.newKeyMap.set(data.clientId, newKeys)
        }

        if (data.payload && !data.payload.timestamp)
            data.payload.timestamp = Date.now()

        let payload = {...subscription, ...data.payload}
        delete payload.privateKey
        delete payload.publicKey
        payload = JSON.stringify(payload);

        const options = {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.getVapidJWT(subscription.privateKey)}`,
                'Content-Type': 'application/json',
            },
        };

        const pushRequest = https.request(subscription.endpoint, options, (response) => {
            console.log(`Push notification status: ${response.statusCode}`);
        });

        pushRequest.on('error', (error) => {
            console.error('Error sending push notification:', error);
        });

        pushRequest.write(payload);
        pushRequest.end();
    }

    generateVapidKeys() {
        const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
            modulusLength: 4096, // Choose an appropriate key length
            privateKeyEncoding: {
                type: 'pkcs8',
                format: 'pem',
            },
            publicKeyEncoding: {
                type: 'spki',
                format: 'pem',
            },
        });
        return { privateKey, publicKey, privateKeyCreatedOn: new Date().toISOString() };
    }

    // Function to generate a VAPID JWT
    getVapidJWT(privateKey, subscription) {
        const header = { 'alg': 'RS256', 'typ': 'JWT' };
        const currentTimestamp = Math.floor(Date.now() / 1000);
        const expirationTimeInSeconds = 90 * 24 * 60 * 60; // 90 days in seconds
        const expirationTime = currentTimestamp + expirationTimeInSeconds;

        const payload = {
            'aud': subscription.endpoint,
            'exp': expirationTime,
            'sub': 'mailto:contact@cocreate.app'
        };

        const jwt = this.base64URLEncode(JSON.stringify(header)) + '.' + this.base64URLEncode(JSON.stringify(payload));
        const signature = crypto.createSign('sha256').update(jwt).sign(privateKey, 'base64');
        return jwt + '.' + this.base64URLEncode(signature);
    }

    // Function to base64 URL encode
    base64URLEncode(value) {
        return value.toString('base64')
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=/g, '');
    }


}
module.exports = CoCreateNotification;

const payloadExample = {
    body: 'This is the notification body text',
    icon: '/path/to/notification-icon.png',
    badge: '/path/to/notification-badge.png',
    actions: [
        { action: 'action-1', title: 'Action 1' },
        { action: 'action-2', title: 'Action 2' },
    ],
    tag: 'notification-tag', // A unique identifier for the notification
    data,
    vibrate: [100, 50, 100], // Vibration pattern (milliseconds)
    image: '/path/to/notification-image.jpg', // An image to display within the notification
    requireInteraction: true, // Requires user interaction to close the notification
    silent: true, // Delivers a silent notification (no sound or vibration)
    renotify: true, // Allows a notification with the same tag to renotify the user
    actions: [
        { action: 'action-1', title: 'Action 1' },
        { action: 'action-2', title: 'Action 2' },
    ],
    timestamp: Date.now(), // A timestamp for the notification
}


