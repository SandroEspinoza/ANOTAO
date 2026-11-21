from fastapi import FastAPI

app = FastAPI(title="ANOTAO API")

@app.get("/")
def read_root():
    return {"mensaje": "API de ANOTAO funcionando"}
