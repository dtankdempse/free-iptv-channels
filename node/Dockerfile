# Use the official Node.js image from Docker Hub
FROM node:18-alpine

# Set the working directory inside the container
WORKDIR /usr/src/app

# Copy the current directory contents into the container at /usr/src/app
COPY . .

# Expose port 4242 for the application
EXPOSE 4242

# Start the Node.js application
CMD ["node", "index.js"]