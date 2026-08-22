FROM node:24-bookworm-slim

# Install OCR + PDF rendering dependencies
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
       tesseract-ocr \
       poppler-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

ENV NODE_ENV=production

CMD ["npm", "start"]