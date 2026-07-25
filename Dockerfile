# Stage 1: Build the application
FROM node:22-alpine AS build

# Set the working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./

# Install both production and development dependencies
# Use npm ci for clean and reproducible builds
RUN npm ci --legacy-peer-deps

# Copy all source files
COPY . .

# Run the build command
RUN npm run build

# Stage 2: Create the production image
FROM node:22-alpine AS production

# Set the working directory
WORKDIR /app

# Copy package files and install only production dependencies
COPY package*.json ./

# Install only production dependencies
RUN npm ci --omit=dev --legacy-peer-deps && npm cache clean --force

# Copy necessary files from the build stage
COPY --from=build /app/dist ./dist

# Copy other required files for runtime
COPY locales ./locales

# Expose the port your application listens on (e.g., 3000)
# EXPOSE 3000

# Set the command to run the application
# ... (your other Dockerfile instructions) ...
EXPOSE 5002
CMD ["node", "dist/src/main"]
