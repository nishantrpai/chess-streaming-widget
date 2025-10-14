# Chess Streaming Widget

A modern, responsive chess streaming widget designed for streamers who want to display their chess statistics on Lichess and Chess.com during live streams.

## Features

- **Dual Platform Support**: Works with both Lichess and Chess.com
- **Real-time Stats**: Displays rating, wins, losses, win rate, and current streak
- **Auto Tournament Detection**: Automatically detects if you're playing in a tournament
- **Tournament-Specific Ratings**: Shows appropriate rating (bullet/blitz/rapid) based on tournament type
- **Live Tournament Tracking**: Shows your position, points, and total players when in tournaments
- **Last 11 Games**: Visual representation of recent game results
- **Streamer-Friendly**: Optimized for small window sizes (perfect for overlay)
- **PWA Ready**: Can be installed as a Progressive Web App
- **Auto-Save**: Remembers your configuration between sessions

## Quick Start

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Start Development Server**
   ```bash
   npm run dev
   ```

3. **Open in Browser**
   - Visit `http://localhost:5173/`
   - The widget will open with a configuration screen

## How to Use

### Configuration (Screen 1)
1. **Select Platform**: Choose between Lichess or Chess.com
2. **Enter Username**: Your chess platform username
3. **Start Tracking**: Click to begin displaying stats

### Stats Display (Screen 2)
The widget shows:
- **Rating**: Current rating from the selected platform (tournament-specific when in tournament)
- **Wins/Losses**: Win and loss counts with visual cards
- **Win Rate**: Percentage with W/L record
- **Last 11 Games**: Color-coded game results (Green=Win, Red=Loss, Gray=Draw)
- **Current Streak**: Win or loss streak indicator
- **Tournament Info**: When in a tournament:
  - Tournament name (highlighted when live)
  - Your current position (#X / Total players)
  - Tournament points earned
  - Tournament status (Live, Upcoming, Finished)

## For Streamers

### Optimal Usage
- **Window Size**: Designed for 360px width (mobile-friendly)
- **Placement**: Perfect for top-right corner overlay
- **Always On Top**: Use browser's picture-in-picture or window manager
- **Auto-refresh**: Widget automatically refreshes when you're in a tournament
- **Tournament Detection**: No need to manually enter tournament URLs - detection is automatic!

### PWA Installation
1. Open the widget in Chrome/Edge
2. Click the install button in the address bar
3. Install as app for fullscreen, no-navigation experience
4. Pin to taskbar for quick access

## Build for Production

```bash
npm run build
```

The built files will be in the `dist/` directory, ready for deployment.

## Browser Compatibility

- Chrome (recommended for PWA features)
- Firefox
- Safari
- Edge

## API Information

### Lichess API
- Uses public Lichess API (no authentication required)
- Fetches user profile and recent games
- Rate limited to prevent abuse

### Chess.com API
- Uses public Chess.com API (no authentication required)
- Fetches player stats and game history
- May fallback to demo data if API limits are reached

## Development

### Project Structure
```
├── index.html          # Main HTML structure
├── main.js            # Core application logic
├── style.css          # Responsive styling
├── vite.config.js     # Vite configuration
├── public/
│   ├── manifest.json  # PWA manifest
│   ├── sw.js          # Service worker
│   └── chess-icon.svg # App icon
└── package.json       # Dependencies
```

### Key Features
- Responsive design with CSS Grid and Flexbox
- Dark theme optimized for streaming
- Local storage for configuration persistence
- Error handling with fallback data
- Modern JavaScript (ES6+)

## Troubleshooting

### Common Issues

1. **"User not found" error**: Verify username spelling and platform selection
2. **Stats not loading**: Check internet connection and try refreshing
3. **CORS errors**: Some browsers may block cross-origin requests in development

### Solutions
- Use Chrome for best compatibility
- Ensure username exists on selected platform
- Try the demo mode if API calls fail

## Contributing

Feel free to submit issues and enhancement requests!

## License

MIT License - feel free to use for personal or commercial streaming.
