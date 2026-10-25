data flow:
1. user event
2. web browser
3. hx-post
4. FastAPI
5. server updates current_config
6. IsometricMathEngine
7. compute_field()
8. serialize result through websocket
9. push over ws://
10. engine.js viz
11. requestAnimationFrame executes hardware-accelerated WebGL Draw call
12. draw on screen

==

localhost:8000/docs
-> swagger / openAPI : endpoint interface

==

full: (0) data source -> (1) crawler -> (2) database -> (3) backend -> (4) frontend

[data-flow]
0. click sync | GUI
1. htmx post -> /crawler/sync | components/crawler_controller.py
2. FastAPI router: /crawler/sync | routers/crawler_controller.py
3. subprocess

[status-indicator]
4. httpx -> /internal/notify-status | surrogate.py
5. FastAPI router: /internal/notify-status | routers/crawler_controller.py
6. websocket | utils/websocket
7. JS router | static/js/level_selector.js > Master > routeEvent
8. update DOM element attribute | static/js/level_selector.js > CrawlerController.updateStatus > indicator.textContent
9. script activation | templates/level_selector.html

[events]
4. sqlite API | surrogate.py > DB
5. sqlite DB | data/database.db