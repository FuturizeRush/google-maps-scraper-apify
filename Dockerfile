# Use Apify SDK base image with Node 20 and Chrome
FROM apify/actor-node-puppeteer-chrome:20

# Copy package files
COPY package*.json ./

# Install NPM dependencies
RUN npm install --omit=dev

# Copy source code
COPY . .

# Run the Actor
CMD npm start