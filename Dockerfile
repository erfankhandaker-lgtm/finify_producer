# Stage 1: Build the application
FROM node:20-alpine3.19 AS build

# Set the working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./

# Install both production and development dependencies
# Use npm ci for clean and reproducible builds
RUN npm ci

# Copy all source files
COPY . .

# Run the build command
RUN npm run build

# Stage 2: Create the production image
FROM node:20-alpine3.19 AS production

# Set the working directory
WORKDIR /app

# Copy package files and install only production dependencies
COPY package*.json ./

# Install only production dependencies
RUN npm ci --only=production

# Copy necessary files from the build stage
COPY --from=build /app/dist ./dist

# Copy other required files for runtime
COPY .env ./
COPY ssl ./ssl
COPY locales ./locales

# Expose the port your application listens on (e.g., 3000)
# EXPOSE 3000

# Set the command to run the application
# ... (your other Dockerfile instructions) ...
EXPOSE 5002
CMD ["node", "dist/main"]