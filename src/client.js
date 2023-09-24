import socket from '@cocreate/socket-client'
// import actions from '@cocreate/actions'

// Request push notification permission
const permission = await Notification.requestPermission();
if (permission === 'granted') {
    // User granted push notification permission, handle it here
    subscribeToPushNotifications();
}


async function handlePushPermission() {
    // Request push notification permission
    const permission = await Notification.requestPermission();

    if (permission === 'granted') {
        // Permission granted, create or update the subscription
        const registration = await navigator.serviceWorker.ready;
        try {
            // Create a new subscription or retrieve the existing one
            const existingSubscription = await registration.pushManager.getSubscription();

            if (existingSubscription) {
                // Update the existing subscription if needed
                // This might involve generating a new public key or other changes
                // For this example, we'll assume no updates are needed
                console.log('Subscription already exists:', existingSubscription);
            } else {
                //TODO: getPublicKey
                let response = await socket.send({
                    method: 'notification.publicKey',
                })

                if (!response.publicKey)
                    return

                // Create a new subscription
                const newSubscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: response.publicKey,
                });

                await socket.send({
                    method: 'notification.subscription',
                    subscription: newSubscription
                })

                console.log('New subscription created:', newSubscription);

                navigator.serviceWorker.addEventListener('pushsubscriptionchange', (event) => {
                    // Handle the subscription change here
                    const newSubscription = event.newSubscription;
                    const oldSubscription = event.oldSubscription;

                    socket.send({
                        method: 'notification.subscription',
                        subscription: newSubscription
                    })

                });

            }
        } catch (error) {
            console.error('Error handling push subscription:', error);
        }
    } else {
        // Permission denied, handle accordingly
        console.warn('Push notification permission denied.');
    }
}

// Call the function when the user interacts with a relevant UI element (e.g., a button)
document.querySelector('[actions*="notification.subscribe"]').addEventListener('click', handlePushPermission);

// actions.init({
//     name: "notification",
//     endEvent: "notification",
//     callback: (action) => handlePushPermission
// });
