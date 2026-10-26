# 1. spawn app
from fastapi import FastAPI
import routers.crawler_controller
app = FastAPI(title='Adventure Engine', version='3.0.0')

# 2. plug in routers
import routers
app.include_router(routers.template.router)
app.include_router(routers.websocket.router)
app.include_router(routers.crawler_controller.router)
app.include_router(routers.database.router)

# 3. mount
from fastapi.staticfiles import StaticFiles
app.mount('/static', StaticFiles(directory='static'), name='static')

# 4. stream
if __name__ == '__main__':
    import uvicorn
    uvicorn.run('server:app', host='127.0.0.1', port=8000, reload=True)