# Music Assistant Web

A simple and modern web interface for Music Assistant.

The goal is to provide an easy-to-use interface for music, radio,
favorites, playlists and Music Assistant players without exposing the
complexity of the full Music Assistant interface.

## Architecture

```text
Browser
   |
   | HTTP / WebSocket
   v
Backend API
   |
   | Music Assistant API
   v
Music Assistant