import socket from '@cocreate/socket-client'
// import actions from '@cocreate/actions'

async function handlePushPermission() {
    // Request push notification permission
    const permission = await Notification.requestPermission();

    if (permission === 'granted') {
        // Permission granted, create or update the subscription
        const registration = await navigator.serviceWorker.ready;
        try {
            // Create a new subscription or retrieve the existing one
            let subscription = await registration.pushManager.getSubscription();

            if (!subscription) {
                //TODO: getPublicKey
                let response = await socket.send({
                    method: 'notification.publicKey',
                })

                if (!response.publicKey)
                    return

                // Create a new subscription
                subscription = await registration.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: response.publicKey,
                });

            }

            await socket.send({
                method: 'notification.subscription',
                subscription: subscription
            })

            console.log('New subscription created:', subscription);

            navigator.serviceWorker.addEventListener('pushsubscriptionchange', (event) => {
                // Handle the subscription change here
                const newSubscription = event.newSubscription;
                const oldSubscription = event.oldSubscription;

                socket.send({
                    method: 'notification.subscription',
                    subscription: subscription
                })

            });
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
export default {}