const statusMap = {
    failed: "err",
    syncing: "busy",
    idle: "ok",
};

(() => {
    // server -> map (the class itself knows nothing about Feed)
    // Feed.on('status_change', payload => Pods.crawler.set(
    //     statusMap[payload.status] ?? 'unknown',
    //     payload.status
    // ));

    Feed.on('status_change', ({ status }) =>
        Pods.crawler.set(
            statusMap[status] ?? 'unknown',
            status
        )
    );

    // const mount = document.getElementById('control-mount');

    // document.addEventListener('crawler:sync', async () => {
    //     console.log('Crawler sync triggered');
    //     await fetch('/crawler/sync', {
    //         method: 'POST',
    //     });
    // });

    document.addEventListener('crawler:sync', async () => {
        const body = new URLSearchParams({ name: 'luma' });

        const res = await fetch('/crawler/sync', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            body,
        });

        if (!res.ok) {
            console.error('Sync failed:', await res.text());
            return;
        }

        console.log(await res.json());
    });
})();