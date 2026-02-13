self.addEventListener('fetch', function (event) {
    // Local Cache
    event.respondWith(
        caches.open("gravity.cache").then(cache =>
            cache.match(event.request).then(function (response) {

                const f = fetch(event.request, { cache: 'no-cache' }).then(function (response) {
                    const copy = response.clone();
                    cache.put(event.request, copy);
                    return response;
                })
                if (response) {
                    return response;
                }
                else {
                    return f;
                }
            })
        )
    )
});