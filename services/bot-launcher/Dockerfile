FROM python:3.11-slim

WORKDIR /app

COPY bot-launcher/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY shared/ /app/shared/
COPY bot-launcher/app.py .
COPY bot-launcher/templates/ templates/

EXPOSE 8080

CMD ["python", "app.py"] 