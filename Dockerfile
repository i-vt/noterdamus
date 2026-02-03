# Use Node 20 on Bullseye (Debian 11) to ensure compatibility with Chrome dependencies
FROM node:20-bullseye

# 1. Install Google Chrome Stable and dependencies for Puppeteer
# We explicitly install google-chrome-stable because apps/newsboat-ui/server.js
# hardcodes 'executablePath: /usr/bin/google-chrome-stable'
RUN apt-get update && apt-get install -y wget gnupg \
    && wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/googlechrome-linux-keyring.gpg \
    && sh -c 'echo "deb [arch=amd64 signed-by=/usr/share/keyrings/googlechrome-linux-keyring.gpg] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google.list' \
    && apt-get update \
    && apt-get install -y google-chrome-stable fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf libxss1 \
      --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# 2. Set working directory
WORKDIR /app

# 3. Copy root package files
COPY package.json ./

# 4. Copy sub-app package files manually to ensure workspaces install correctly
#    (This allows Docker to cache the 'npm install' layer if code changes but deps don't)
COPY apps/image-saver/package.json ./apps/image-saver/
COPY apps/md-editor/package.json ./apps/md-editor/
COPY apps/newsboat-ui/package.json ./apps/newsboat-ui/
COPY apps/pdf-annotator/package.json ./apps/pdf-annotator/

# 5. Install Dependencies (from root, handling workspaces)
RUN npm install

# 6. Copy the rest of the source code
COPY . .

# 7. Expose ports defined in your .env
# Image Saver (24043), PDF (24044), News (24045), MD (24046)
EXPOSE 24043 24044 24045 24046

# 8. Start the application
# Note: You may want to update package.json to include "start:md" in the main start command
CMD ["npm", "start"]
