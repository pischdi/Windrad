# Python + rasterio (Wheels bündeln GDAL/PROJ -> kein System-GDAL nötig).
FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY tileproc.py job.py server.py ./

# Standard = Service (fuer /ensure). Der Cloud Run JOB ueberschreibt beim Deploy
# mit  --command python3 --args job.py
CMD ["gunicorn", "--bind", ":8080", "--workers", "2", "--timeout", "600", "server:app"]
