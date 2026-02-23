export async function createChainClient(config) {
    const subscriptions = [];
    return {
        config,
        subscribeToEntityUpdates(callback) {
            subscriptions.push(callback);
            return () => {
                const idx = subscriptions.indexOf(callback);
                if (idx >= 0)
                    subscriptions.splice(idx, 1);
            };
        },
        async getEntities(options = {}) {
            // Placeholder: In production, this queries Torii for entities
            // The actual implementation will use @dojoengine/sdk's client
            return [];
        },
    };
}
//# sourceMappingURL=client.js.map