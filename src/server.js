const crypto = require('crypto');
const https = require('https');
const webpush = require('web-push');

class CoCreateNotification {
    constructor(crud) {
        this.socket = crud.wsManager
        this.crud = crud
        this.newKeyMap = new Map()
        this.subscriptions = new Map()
        this.init();
    }

    init() {
        if (this.socket) {
            this.socket.on('notification.publicKey', (data) => this.publicKey(data));
            this.socket.on('notification.subscription', (data) => this.subscription(data));
            this.socket.on('notification.send', (data) => this.send(data));
            this.socket.on('notification.user', (data) => this.addUser(data));
        }
    }

    // Function to generate VAPID keys (public and private)
    addUser(data) {
        this.crud.send({
            method: 'object.update',
            array: 'clients',
            object: {
                _id: data.clientId,
                user_id: data.user_id
            },
            organization_id: data.organization_id
        })
    }

    publicKey(data) {
        let subscription = this.subscriptions.has(data.clientId)
        if (!subscription) {
            // let newKeys = this.generateVapidKeys()
            subscription = webpush.generateVAPIDKeys()
            this.newKeyMap.set(data.clientId, subscription)
        }

        console.log('subscription: ', subscription)

        data.publicKey = subscription.publicKey
        if (data.socket)
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
                newKeys = await this.crud.send({
                    method: 'object.read',
                    array: 'clients',
                    object: {
                        _id: data.clientId
                    }
                })
                if (newKeys && newKeys.object && newKeys.object[0]) {
                    newKeys = newKeys.object[0]
                    newKeys = { ...newKeys, ...data.subscription }
                    this.subscriptions.set(data.clientId, { ...newKeys, ...data.subscription })
                } else {
                    this.publicKey(data)
                    this.subscription(data)
                }
            }

        }

        if (newKeys) {
            let tokenOptions = {
                vapidDetails: {
                    subject: 'mailto:contact@cocreate.app',
                    publicKey: newKeys.publicKey,
                    privateKey: newKeys.privateKey
                },
                // Other optional options can be included here
            };

            const jwt = webpush.generateRequestDetails(data.subscription, null, tokenOptions);

            this.crud.send({
                method: 'object.update',
                array: 'clients',
                object: {
                    _id: data.clientId,
                    ...data.subscription,
                    ...newKeys,
                    jwt
                },
                upsert: true,
                organization_id: data.organization_id
            });
        }
    };

    // Load the client's subscription object from storage
    async send(data) {
        let subscription = this.subscriptions.get(data.clientId)
        if (!subscription) {
            try {
                subscription = await this.crud.send({
                    method: 'object.read',
                    array: 'clients',
                    object: {
                        _id: data.clientId
                    },
                    organization_id: data.organization_id

                })
            } catch (error) {
                console.log(error)
            }
            if (subscription && subscription.object && subscription.object[0])
                subscription = subscription.object[0]
        }
        if (!subscription || !subscription.privateKey)
            return

        const cutoffDate = new Date(new Date().toISOString());
        cutoffDate.setDate(cutoffDate.getDate() - 90);

        // Compare the modification time with the cutoff date
        if (!this.newKeyMap.has(data.clientId) && subscription.privateKeyCreatedOn < cutoffDate) {
            let newKeys = this.generateVapidKeys()
            this.newKeyMap.set(data.clientId, newKeys)
        }

        if (data.payload && !data.payload.timestamp)
            data.payload.timestamp = new Date().toISOString()

        // let payload = data.payload
        // delete payload.privateKey
        // delete payload.publicKey

        let tokenOptions = {
            vapidDetails: {
                subject: 'mailto:contact@cocreate.app',
                publicKey: subscription.publicKey,
                privateKey: subscription.privateKey
            },
            // Other optional options can be included here
        };

        const jwt = webpush.generateRequestDetails(subscription.endpoint, payload, tokenOptions);
        const apiKey = getAPIKeyForEndpoint(subscription.endpoint);


        const options = {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey || jwt.headers.Authorization}`,
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

    getAPIKeyForEndpoint(endpoint) {
        // Define the mapping of browser endpoints to API keys
        const browserEndpointsAndAPIKeys = {
            'https://fcm.googleapis.com/': 'yourFCMApiKey',
            'https://updates.push.services.mozilla.com/wpush/v2/': 'yourMozillaPushServiceApiKey',
            'https://api.push.apple.com/': 'yourAPNsApiKey', // For Safari on Mac
            'https://api.sandbox.push.apple.com/': 'yourAPNsDevApiKey', // For Safari on iOS (Development)
            'https://api.push.apple.com/': 'yourAPNsProdApiKey', // For Safari on iOS (Production)
            // Add more browser endpoints and their API keys as needed
        };

        // Iterate through the keys in the mapping
        for (const browserEndpoint of Object.keys(browserEndpointsAndAPIKeys)) {
            if (endpoint.startsWith(browserEndpoint)) {
                // Return the associated API key if the endpoint starts with a known browser endpoint
                return browserEndpointsAndAPIKeys[browserEndpoint];
            }
        }
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
        const base64 = Buffer.from(value).toString('base64');
        return base64
            .replace(/\+/g, '-')
            .replace(/\//g, '_')
            .replace(/=+$/, ''); // Remove trailing equal signs
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
    data: {},
    vibrate: [100, 50, 100], // Vibration pattern (milliseconds)
    image: '/path/to/notification-image.jpg', // An image to display within the notification
    requireInteraction: true, // Requires user interaction to close the notification
    silent: true, // Delivers a silent notification (no sound or vibration)
    renotify: true, // Allows a notification with the same tag to renotify the user
    actions: [
        { action: 'action-1', title: 'Action 1' },
        { action: 'action-2', title: 'Action 2' },
    ],
    timestamp: new Date().toISOString(), // A timestamp for the notification
}


