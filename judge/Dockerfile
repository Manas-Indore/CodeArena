FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive

# Java (17), Python 3, g++ (C++), plus curl/gnupg needed to add the NodeSource repo
RUN apt-get update && apt-get install -y --no-install-recommends \
    openjdk-17-jdk-headless \
    python3 \
    g++ \
    curl \
    ca-certificates \
    gnupg \
    && curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /code