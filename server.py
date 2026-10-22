# 1. spawn app
from fastapi import FastAPI
import routers.crawler_controller
app = FastAPI(title='Generative Isometric Engine', version='3.0.0')

# 2. plug in routers
# from routers import css, level_selector, ui, api
import routers
app.include_router(routers.css.router)
# app.include_router(ui.router)
# app.include_router(api.router)
app.include_router(routers.level_selector.router)
app.include_router(routers.crawler_controller.router)
app.include_router(routers.database.router)

# 3. mount
from fastapi.staticfiles import StaticFiles
app.mount('/static', StaticFiles(directory='static'), name='static')

# 4. stream
if __name__ == '__main__':
    import uvicorn
    uvicorn.run('server:app', host='127.0.0.1', port=8000, reload=True)