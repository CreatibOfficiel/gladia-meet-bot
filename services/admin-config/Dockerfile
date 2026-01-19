FROM python:3.11-slim

WORKDIR /app

COPY admin-config/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY shared/ /app/shared/
COPY admin-config/app.py .

EXPOSE 8080

CMD ["python", "app.py"]
