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

web app to crawl event listing platforms and re-visualize. 



full: (0) data source -> (1) crawler -> (2) database -> (3) backend -> (4) frontend



request: 0->2

page load: 2->4

time of last sync = <>

DB - json, sqlalchemy, (rag: neo4j vs qdrant)