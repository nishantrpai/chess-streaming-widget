import './style.css'
import ChessWebAPI from 'chess-web-api'

// Explicitly define global properties
window.chessWidget = null;
window.lucide = window.lucide || {};

// Initialize Chess.com API client
const chessAPI = new ChessWebAPI();

// Chess Widget Application
class ChessWidget {
  constructor() {
    this.currentPlatform = 'lichess';
    this.currentUsername = '';
    this.currentRatingType = 'best';
    this.refreshInterval = null; // For auto-refresh
    this.refreshCountdownInterval = null; // For countdown display
    this.nextRefreshTime = 0;
    this.stats = {
      rating: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      winRate: 0,
      lastGames: [],
      currentStreak: 0,
      streakType: 'win',
      // Tournament-specific stats
      tournamentPosition: null,
      tournamentPoints: 0,
      tournamentTotalPlayers: null,
      tournamentStatus: '',
      tournamentName: '',
      tournamentType: '', // bullet, blitz, rapid, classical
      isInTournament: false,
      lastUpdated: null,
      // Manual adjustments
      winsAdjustment: 0,
      lossesAdjustment: 0,
      drawsAdjustment: 0
    };
    this.init();
  }

  init() {
    this.bindEvents();
    this.loadStoredConfig();
    this.loadAdjustments();
    this.loadSponsorSettings();
  }

  bindEvents() {
    const startBtn = document.getElementById('start-tracking');
    const settingsIcon = document.getElementById('settings-icon');

    if (startBtn) {
      startBtn.addEventListener('click', () => this.startTracking());
    }
    if (settingsIcon) {
      settingsIcon.addEventListener('click', () => this.backToConfig());
    }
    
    // Add event listeners for adjustment buttons
    this.bindAdjustmentButtons();
    
    // Add event listeners for sponsor functionality
    this.bindSponsorEvents();
  }
  
  bindAdjustmentButtons() {
    // Use event delegation to handle dynamically added buttons
    document.addEventListener('click', (e) => {
      // Check if the clicked element or its parent is an adjust button
      if (e.target && e.target instanceof Element) {
        const button = e.target.closest('.adjust-btn');
        if (button && button instanceof HTMLElement) {
          e.preventDefault();
          const type = button.dataset.type; // 'wins', 'losses', or 'draws'
          const action = button.dataset.action; // 'increase' or 'decrease'
          if (type && action) {
            this.adjustStat(type, action);
          }
        }
      }
    });
  }
  
  adjustStat(type, action) {
    if (type === 'wins') {
      if (action === 'increase') {
        this.stats.wins++;
        this.stats.winsAdjustment++;
      } else if (action === 'decrease' && this.stats.wins > 0) {
        this.stats.wins--;
        this.stats.winsAdjustment--;
      }
    } else if (type === 'losses') {
      if (action === 'increase') {
        this.stats.losses++;
        this.stats.lossesAdjustment++;
      } else if (action === 'decrease' && this.stats.losses > 0) {
        this.stats.losses--;
        this.stats.lossesAdjustment--;
      }
    } else if (type === 'draws') {
      if (action === 'increase') {
        this.stats.draws++;
        this.stats.drawsAdjustment++;
      } else if (action === 'decrease' && this.stats.draws > 0) {
        this.stats.draws--;
        this.stats.drawsAdjustment--;
      }
    }
    
    // Recalculate win rate
    const totalGames = this.stats.wins + this.stats.losses + this.stats.draws;
    this.stats.winRate = totalGames > 0 ? Math.round((this.stats.wins / totalGames) * 100) : 0;
    
    // Update UI
    this.updateUI();
    
    // Save the adjustment to localStorage for persistence
    this.saveAdjustments();
  }
   saveAdjustments() {
    const adjustments = {
      winsAdjustment: this.stats.winsAdjustment || 0,
      lossesAdjustment: this.stats.lossesAdjustment || 0,
      drawsAdjustment: this.stats.drawsAdjustment || 0,
      timestamp: Date.now()
    };
    localStorage.setItem('chess-widget-adjustments', JSON.stringify(adjustments));
  }

  loadAdjustments() {
    const stored = localStorage.getItem('chess-widget-adjustments');
    if (stored) {
      const adjustments = JSON.parse(stored);
      // Only apply adjustments if they're from today (to reset daily)
      const today = new Date().toDateString();
      const adjustmentDate = new Date(adjustments.timestamp).toDateString();
      
      if (today === adjustmentDate) {
        this.stats.winsAdjustment = adjustments.winsAdjustment || 0;
        this.stats.lossesAdjustment = adjustments.lossesAdjustment || 0;
        this.stats.drawsAdjustment = adjustments.drawsAdjustment || 0;
      }
    }
  }

  loadStoredConfig() {
    const stored = localStorage.getItem('chess-widget-config');
    if (stored) {
      const config = JSON.parse(stored);
      document.getElementById('platform').value = config.platform || 'lichess';
      document.getElementById('username').value = config.username || '';
      
      if (config.username) {
        this.currentPlatform = config.platform;
        this.currentUsername = config.username;
        this.showStatsScreen();
        this.refreshStats();
      }
    }
  }

  saveConfig() {
    const config = {
      platform: this.currentPlatform,
      username: this.currentUsername
    };
    localStorage.setItem('chess-widget-config', JSON.stringify(config));
  }

  async startTracking() {
    const platform = document.getElementById('platform').value;
    const username = document.getElementById('username').value.trim();

    if (!username) {
      this.showError('Please enter a username');
      return;
    }

    this.currentPlatform = platform;
    this.currentUsername = username;
    
    this.saveConfig();
    this.showStatsScreen();
    await this.refreshStats();
  }

  showError(message) {
    // Remove existing error
    const existingError = document.querySelector('.error');
    if (existingError) {
      existingError.remove();
    }

    // Add new error
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error';
    errorDiv.textContent = message;
    
    const startBtn = document.getElementById('start-tracking');
    startBtn.parentNode.insertBefore(errorDiv, startBtn);
  }

  showStatsScreen() {
    document.getElementById('config-screen').classList.remove('active');
    document.getElementById('stats-screen').classList.add('active');
    
    // Refresh icons after screen change
    setTimeout(() => refreshIcons(), 100);
  }

  backToConfig() {
    // Stop auto-refresh when going back to config
    this.stopAutoRefresh();
    
    document.getElementById('stats-screen').classList.remove('active');
    document.getElementById('config-screen').classList.add('active');
  }

  async refreshStats() {
    this.setLoadingState(true);
    
    try {
      if (this.currentPlatform === 'lichess') {
        await this.fetchLichessStats();
      } else {
        await this.fetchChessComStats();
      }
      
      this.updateUI();
      
      // Set up auto-refresh if player is in a tournament
      if (this.stats.isInTournament) {
        this.startAutoRefresh();
      } else {
        this.stopAutoRefresh();
      }
      
      // Update last updated time
      this.stats.lastUpdated = new Date();
      
    } catch (error) {
      console.error('Error fetching stats:', error);
      this.showStatsError('Failed to fetch stats. Please check your username and try again.');
    } finally {
      this.setLoadingState(false);
    }
  }

  startAutoRefresh() {
    // Clear existing interval
    this.stopAutoRefresh();
    
    // Refresh every 5 seconds for real-time tournament updates
    this.refreshInterval = setInterval(() => {
      this.refreshStats();
    }, 5000);
    
    // Set next refresh time
    this.nextRefreshTime = Date.now() + 5000;
    this.startRefreshCountdown();
  }

  stopAutoRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
    if (this.refreshCountdownInterval) {
      clearInterval(this.refreshCountdownInterval);
      this.refreshCountdownInterval = null;
    }
  }

  startRefreshCountdown() {
    // Clear existing countdown
    if (this.refreshCountdownInterval) {
      clearInterval(this.refreshCountdownInterval);
    }
    
    // Update countdown every second
    this.refreshCountdownInterval = setInterval(() => {
      const now = Date.now();
      const timeLeft = Math.max(0, Math.ceil((this.nextRefreshTime - now) / 1000));
      
      const nextRefreshEl = document.getElementById('next-refresh');
      if (nextRefreshEl) {
        if (timeLeft > 0) {
          nextRefreshEl.textContent = `(next refresh in ${timeLeft}s)`;
        } else {
          nextRefreshEl.textContent = '';
          // Update next refresh time
          this.nextRefreshTime = Date.now() + 5000;
        }
      }
    }, 1000);
  }

  setLoadingState(loading) {
    const elements = [
      document.getElementById('rating'),
      document.getElementById('wins'),
      document.getElementById('losses'),
      document.getElementById('win-percentage')
    ];

    elements.forEach(el => {
      if (loading) {
        el.classList.add('loading');
        el.textContent = 'Loading...';
      } else {
        el.classList.remove('loading');
      }
    });
  }

  async fetchLichessStats() {
    // First, check if user is currently playing in any tournaments
    const currentTournaments = await this.fetchCurrentLichessTournaments();
    
    let tournamentInfo = null;
    let rating = 1500;
    
    if (currentTournaments && currentTournaments.length > 0) {
      // Player is in tournament(s), use the most recent one
      tournamentInfo = currentTournaments[0];
      this.stats.isInTournament = true;
      this.stats.tournamentName = tournamentInfo.fullName || 'Lichess Tournament';
      this.stats.tournamentType = tournamentInfo.perf || 'blitz';
      this.stats.tournamentTotalPlayers = tournamentInfo.nbPlayers;
      this.stats.tournamentStatus = this.getLichessTournamentStatus(tournamentInfo);
      
      // Get user's position in tournament
      try {
        const standings = await this.fetchLichessTournamentStandings(tournamentInfo.id);
        const playerEntry = standings.players?.find(p => 
          p.name.toLowerCase() === this.currentUsername.toLowerCase()
        );
        
        if (playerEntry) {
          this.stats.tournamentPosition = playerEntry.rank;
          this.stats.tournamentPoints = playerEntry.score;
        }
      } catch (standingsError) {
        console.log('Could not fetch tournament standings:', standingsError);
      }
      
      // Fetch tournament games
      try {
        const tournamentGames = await this.fetchLichessTournamentGames(tournamentInfo.id);
        if (tournamentGames && tournamentGames.length > 0) {
          // Get rating from tournament performance or user profile
          const profileResponse = await fetch(`https://lichess.org/api/user/${this.currentUsername}`);
          const profile = profileResponse.ok ? await profileResponse.json() : {};
          rating = this.getRatingByTournamentType(profile, this.stats.tournamentType);
          
          this.processGames(tournamentGames, 'lichess', rating);
          return;
        }
      } catch (tournamentGamesError) {
        console.log('Could not fetch tournament games:', tournamentGamesError);
      }
    } else {
      // Not in tournament, fetch regular stats
      this.stats.isInTournament = false;
      this.stats.tournamentName = '';
      this.stats.tournamentType = '';
    }
    
    // Fallback to regular profile stats
    const profileResponse = await fetch(`https://lichess.org/api/user/${this.currentUsername}`);
    if (!profileResponse.ok) {
      throw new Error('User not found');
    }
    const profile = await profileResponse.json();

    // Get rating (classical > rapid > blitz)
    rating = profile.perfs?.classical?.rating || 
             profile.perfs?.rapid?.rating || 
             profile.perfs?.blitz?.rating || 1500;

    // Fetch recent games
    const gamesResponse = await fetch(`https://lichess.org/api/games/user/${this.currentUsername}?max=50&rated=true&perfType=classical,rapid,blitz`);
    if (!gamesResponse.ok) {
      throw new Error('Could not fetch games');
    }
    
    const gamesText = await gamesResponse.text();
    const games = gamesText.trim().split('\n').map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    }).filter(game => game !== null);

    this.processGames(games, 'lichess', rating);
  }

  async fetchChessComStats() {
    console.log('Fetching Chess.com stats for:', this.currentUsername);
    
    try {
      // Fetch user profile and stats using chess-web-api
      const profileResponse = await chessAPI.getPlayer(this.currentUsername);
      if (!profileResponse || !profileResponse.body) {
        throw new Error('User not found');
      }
      console.log('Profile fetched:', profileResponse.body);

      const statsResponse = await chessAPI.getPlayerStats(this.currentUsername);
      if (!statsResponse || !statsResponse.body) {
        throw new Error('Could not fetch stats');
      }
      const stats = statsResponse.body;
      console.log('Stats fetched:', stats);

      // Check if player is currently in any tournaments
      const currentTournaments = await this.fetchCurrentChessComTournaments();
      
      let rating = 1200;
      let games = [];
      
      if (currentTournaments && currentTournaments.length > 0) {
        // Player is in tournament(s)
        const tournament = currentTournaments[0];
        this.stats.isInTournament = true;
        this.stats.tournamentName = tournament.name || 'Chess.com Tournament';
        this.stats.tournamentType = this.detectChessComTournamentType(tournament);
        this.stats.tournamentStatus = 'Live';
        
        // Get rating based on tournament type
        rating = this.getChessComRatingByType(stats, this.stats.tournamentType);
        
        // Try to get tournament position
        try {
          const tournamentData = await this.fetchChessComTournamentData(tournament.id);
          if (tournamentData) {
            this.stats.tournamentTotalPlayers = tournamentData.totalPlayers;
            const playerPosition = this.findPlayerInLeaderboard(tournamentData.leaderboard, this.currentUsername);
            if (playerPosition) {
              this.stats.tournamentPosition = playerPosition.rank;
              this.stats.tournamentPoints = playerPosition.points;
            }
          }
        } catch (tournamentError) {
          console.log('Could not fetch tournament data:', tournamentError);
        }
        
        // Get recent tournament games
        games = await this.getTournamentOnlyGames(tournament);
      } else {
        // Not in tournament, use regular rating
        this.stats.isInTournament = false;
        this.stats.tournamentName = '';
        this.stats.tournamentType = '';
        
        // Get best available rating
        rating = stats.chess_rapid?.last?.rating || 
                stats.chess_blitz?.last?.rating || 
                stats.chess_bullet?.last?.rating ||
                stats.chess_daily?.last?.rating || 1200;
        
        // Fetch regular recent games
        games = await this.fetchChessComRecentGames();
      }
      
      console.log('Using rating:', rating);
      console.log('Processing games:', games.length);
      this.processGames(games, 'chess.com', rating);
      
    } catch (error) {
      console.error('Chess.com API error:', error);
      this.showStatsError(`Chess.com API Error: ${error.message}`);
    }
  }

  processGames(games, platform, rating) {
    console.log('Processing games:', games.length, 'from platform:', platform);
    
    const recentGames = games.slice(-50); // Take most recent 50 games
    let wins = 0;
    let losses = 0;
    let draws = 0;
    const last10Games = [];

    recentGames.forEach((game, index) => {
      let result;
      let isWin = false;

      if (platform === 'lichess') {
        const winner = game.winner;
        const playerColor = game.players.white.user?.id === this.currentUsername.toLowerCase() ? 'white' : 'black';
        
        if (!winner) {
          result = 'draw';
          draws++;
        } else if (winner === playerColor) {
          result = 'win';
          wins++;
          isWin = true;
        } else {
          result = 'loss';
          losses++;
        }
      } else {
        // Chess.com - improved game result parsing
        const whitePlayer = game.white?.username?.toLowerCase();
        const blackPlayer = game.black?.username?.toLowerCase();
        const isWhite = whitePlayer === this.currentUsername.toLowerCase();
        
        console.log(`Game ${index + 1}:`, {
          white: game.white?.username,
          black: game.black?.username,
          whiteResult: game.white?.result,
          blackResult: game.black?.result,
          isWhite: isWhite
        });
        
        // Check for wins
        if ((game.white?.result === 'win' && isWhite) || (game.black?.result === 'win' && !isWhite)) {
          result = 'win';
          wins++;
          isWin = true;
        } 
        // Check for draws/stalemate/agreed
        else if (game.white?.result === 'agreed' || 
                 game.white?.result === 'stalemate' || 
                 game.white?.result === 'repetition' ||
                 game.white?.result === 'insufficient' ||
                 game.black?.result === 'agreed' ||
                 game.black?.result === 'stalemate' ||
                 game.black?.result === 'repetition' ||
                 game.black?.result === 'insufficient') {
          result = 'draw';
          draws++;
        }
        // Everything else is a loss
        else {
          result = 'loss';
          losses++;
        }
      }

      if (index >= recentGames.length - 10) {
        last10Games.unshift(result); // Add to beginning to show most recent first
      }
    });

    // Calculate streak from most recent games
    let currentStreak = 0;
    let streakType = 'win';
    
    for (const game of last10Games) {
      if (game === 'win') {
        if (streakType === 'win') {
          currentStreak++;
        } else {
          streakType = 'win';
          currentStreak = 1;
        }
      } else if (game === 'loss') {
        if (streakType === 'loss') {
          currentStreak++;
        } else {
          streakType = 'loss';
          currentStreak = 1;
        }
      } else {
        // Draw breaks streak
        currentStreak = 0;
      }
      break; // Only look at the most recent game for current streak
    }

    const totalGames = wins + losses + draws;
    const winRate = totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0;

    console.log('Final stats:', { wins, losses, draws, winRate, totalGames });

    // Apply manual adjustments
    const adjustedWins = Math.max(0, wins + (this.stats.winsAdjustment || 0));
    const adjustedLosses = Math.max(0, losses + (this.stats.lossesAdjustment || 0));
    const adjustedTotalGames = adjustedWins + adjustedLosses + draws;
    const adjustedWinRate = adjustedTotalGames > 0 ? Math.round((adjustedWins / adjustedTotalGames) * 100) : 0;

    // Preserve tournament info when updating stats
    const existingTournamentInfo = {
      tournamentPosition: this.stats.tournamentPosition,
      tournamentPoints: this.stats.tournamentPoints,
      tournamentTotalPlayers: this.stats.tournamentTotalPlayers,
      tournamentStatus: this.stats.tournamentStatus,
      tournamentName: this.stats.tournamentName,
      isInTournament: this.stats.isInTournament,
      winsAdjustment: this.stats.winsAdjustment || 0,
      lossesAdjustment: this.stats.lossesAdjustment || 0
    };

    this.stats = {
      rating,
      wins: adjustedWins,
      losses: adjustedLosses,
      draws,
      winRate: adjustedWinRate,
      lastGames: last10Games,
      currentStreak,
      streakType,
      ...existingTournamentInfo
    };
  }

  generateMockStats() {
    // Generate mock data for demo purposes
    const mockGames = ['win', 'win', 'loss', 'win', 'win', 'win', 'win', 'loss', 'win', 'win'];
    const wins = mockGames.filter(g => g === 'win').length;
    const losses = mockGames.filter(g => g === 'loss').length;
    const winRate = Math.round((wins / mockGames.length) * 100);

    this.stats = {
      rating: 1650,
      wins: wins,
      losses: losses,
      draws: 0,
      winRate: winRate,
      lastGames: mockGames,
      currentStreak: 2,
      streakType: 'win'
    };
  }

  updateUI() {
    // Update tournament info
    this.updateTournamentInfo();
    
    // Update rating
    const ratingEl = document.getElementById('rating');
    if (ratingEl) ratingEl.textContent = String(this.stats.rating);

    // Update wins/losses/draws
    const winsEl = document.getElementById('wins');
    const lossesEl = document.getElementById('losses');
    const drawsEl = document.getElementById('draws');
    
    if (winsEl) winsEl.textContent = String(this.stats.wins);
    if (lossesEl) lossesEl.textContent = String(this.stats.losses);
    if (drawsEl) drawsEl.textContent = String(this.stats.draws);

    // Update win rate
    const winPercentageEl = document.getElementById('win-percentage');
    const recordWinsEl = document.getElementById('record-wins');
    const recordLossesEl = document.getElementById('record-losses');
    const recordDrawsEl = document.getElementById('record-draws');
    
    if (winPercentageEl) winPercentageEl.textContent = `${this.stats.winRate}%`;
    if (recordWinsEl) recordWinsEl.textContent = `${this.stats.wins}W`;
    if (recordLossesEl) recordLossesEl.textContent = `${this.stats.losses}L`;
    if (recordDrawsEl) recordDrawsEl.textContent = `${this.stats.draws}D`;

    // Update streak
    const streakText = this.stats.currentStreak > 0 
      ? `${this.stats.currentStreak} ${this.stats.streakType.toUpperCase()} STREAK`
      : 'NO STREAK';
    const streakEl = document.getElementById('streak');
    if (streakEl) streakEl.textContent = streakText;

    // Update last 10 games
    this.updateGamesGrid();
    
    // Update last updated time and start countdown
    this.updateLastUpdatedTime();
    this.startRefreshCountdown();
    
    // Refresh icons after UI update
    refreshIcons();
  }

  updateGamesGrid() {
    const gamesGrid = document.getElementById('games-grid');
    gamesGrid.innerHTML = '';

    // Pad with empty results if less than 10 games
    const games = [...this.stats.lastGames];
    while (games.length < 10) {
      games.push('unknown');
    }

    games.forEach(result => {
      const gameDiv = document.createElement('div');
      gameDiv.className = `game-result ${result}`;
      
      if (result === 'win') {
        gameDiv.textContent = '';
      } else if (result === 'loss') {
        gameDiv.textContent = '';
      } else if (result === 'draw') {
        gameDiv.textContent = '';
      } else {
        gameDiv.textContent = '?';
        gameDiv.style.background = '#333';
      }
      
      gamesGrid.appendChild(gameDiv);
    });
  }

  showStatsError(message) {
    document.getElementById('rating').textContent = 'Error';
    document.getElementById('wins').textContent = '-';
    document.getElementById('losses').textContent = '-';
    document.getElementById('win-percentage').textContent = 'Error';
    console.error(message);
  }

  updateTournamentInfo() {
    const tournamentInfoDiv = document.getElementById('tournament-info');
    const tournamentName = document.getElementById('tournament-name');
    const tournamentStatus = document.getElementById('tournament-status');
    const tournamentRank = document.getElementById('tournament-rank');
    const tournamentTotal = document.getElementById('tournament-total');
    const tournamentPoints = document.getElementById('tournament-points');
    const ratingLabel = document.getElementById('rating-label');
    
    if (this.stats.isInTournament) {
      // Show tournament section
      if (tournamentInfoDiv) tournamentInfoDiv.style.display = 'block';
      if (ratingLabel) {
        ratingLabel.textContent = `${this.stats.tournamentType.toUpperCase()} TOURNAMENT RATING`;
      }
      
      // Set tournament name with highlighting
      if (tournamentName) {
        tournamentName.textContent = this.stats.tournamentName || 'Tournament';
        
        // Add highlighting for active tournament
        if (this.stats.tournamentStatus === 'Live' || this.stats.tournamentStatus === 'Participating') {
          tournamentName.classList.add('highlighted');
        } else {
          tournamentName.classList.remove('highlighted');
        }
      }
      
      // Set tournament position and total players
      if (tournamentRank && tournamentTotal) {
        if (this.stats.tournamentPosition) {
          tournamentRank.textContent = `#${this.stats.tournamentPosition}`;
          tournamentRank.style.color = this.getTournamentRankColor(this.stats.tournamentPosition);
        } else {
          tournamentRank.textContent = '- ';
          tournamentRank.style.color = '';
        }
        
        if (this.stats.tournamentTotalPlayers) {
          tournamentTotal.textContent = `/ ${this.stats.tournamentTotalPlayers}`;
        } else {
          tournamentTotal.textContent = '';
        }
      }
      
      // Set tournament points
      if (tournamentPoints) {
        if (this.stats.tournamentPoints !== null && this.stats.tournamentPoints !== undefined && this.stats.tournamentPoints > 0) {
          tournamentPoints.textContent = `${this.stats.tournamentPoints} pts`;
        } else {
          tournamentPoints.textContent = '0 pts';
        }
      }
      
      // Set tournament status
      if (tournamentStatus) {
        tournamentStatus.textContent = this.stats.tournamentStatus || 'Live Tracking';
        tournamentStatus.style.color = this.getTournamentStatusColor(this.stats.tournamentStatus);
      }
      
    } else {
      // Hide tournament section and clean up highlighting
      if (tournamentInfoDiv) tournamentInfoDiv.style.display = 'none';
      if (ratingLabel) ratingLabel.textContent = 'RATING';
      if (tournamentName) tournamentName.classList.remove('highlighted');
    }
  }

  getTournamentRankColor(position) {
    if (!position) return '';
    
    if (position === 1) return '#ffd700'; // Gold for 1st
    if (position === 2) return '#c0c0c0'; // Silver for 2nd
    if (position === 3) return '#cd7f32'; // Bronze for 3rd
    if (position <= 10) return '#4ade80'; // Green for top 10
    if (position <= 50) return '#3b82f6'; // Blue for top 50
    
    return ''; // Default color for others
  }

  getTournamentStatusColor(status) {
    switch (status) {
      case 'Live':
        return '#4ade80'; // Green
      case 'Upcoming':
        return '#f59e0b'; // Yellow
      case 'Finished':
        return '#6b7280'; // Gray
      case 'Participating':
      case 'Tournament Mode':
        return '#3b82f6'; // Blue
      default:
        return '#4ade80'; // Default green
    }
  }

  // Tournament parsing helper functions
  parseTournamentUrl(url) {
    if (!url) return null;
    
    // Chess.com tournament URL patterns
    const chessComArenaMatch = url.match(/chess\.com\/play\/arena\/(\d+)/);
    const chessComTournamentMatch = url.match(/chess\.com\/tournament\/(\d+)/);
    
    // Lichess tournament URL patterns
    const lichessMatch = url.match(/lichess\.org\/tournament\/([a-zA-Z0-9]+)/);
    
    if (chessComArenaMatch) {
      return {
        platform: 'chess.com',
        type: 'arena',
        id: chessComArenaMatch[1]
      };
    } else if (chessComTournamentMatch) {
      return {
        platform: 'chess.com',
        type: 'tournament',
        id: chessComTournamentMatch[1]
      };
    } else if (lichessMatch) {
      return {
        platform: 'lichess',
        type: 'tournament',
        id: lichessMatch[1]
      };
    }
    
    return null;
  }

  async fetchTournamentStats(tournamentInfo) {
    if (!tournamentInfo) return null;
    
    try {
      if (tournamentInfo.platform === 'chess.com') {
        return await this.fetchChessComTournamentStats(tournamentInfo);
      } else if (tournamentInfo.platform === 'lichess') {
        return await this.fetchLichessTournamentStats(tournamentInfo);
      }
    } catch (error) {
      console.error('Tournament fetch error:', error);
      return null;
    }
  }

  async fetchChessComTournamentStats(tournamentInfo) {
    console.log('Fetching Chess.com tournament data for:', tournamentInfo);
    
    const tournamentId = tournamentInfo.id;
    
    try {
      // Get tournament details
      console.log('Fetching tournament details for ID:', tournamentId);
      const tournamentResponse = await chessAPI.getTournament(tournamentId);
      
      if (tournamentResponse && tournamentResponse.body) {
        const tournament = tournamentResponse.body;
        console.log('Tournament details:', tournament);
        
        // Update tournament info in stats
        this.stats.tournamentName = tournament.name || 'Chess.com Tournament';
        this.stats.isInTournament = true;
        
        // Try to get tournament standings/leaderboard
        try {
          console.log('Attempting to get tournament leaderboard...');
          
          // For Chess.com, we need to try different approaches to get position
          const leaderboardResponse = await this.fetchChessComTournamentLeaderboard(tournamentId);
          
          if (leaderboardResponse) {
            const playerPosition = this.findPlayerInLeaderboard(leaderboardResponse, this.currentUsername);
            if (playerPosition) {
              this.stats.tournamentPosition = playerPosition.rank;
              this.stats.tournamentPoints = playerPosition.points;
              this.stats.tournamentTotalPlayers = leaderboardResponse.totalPlayers || leaderboardResponse.length;
              this.stats.tournamentStatus = 'Live';
            }
          }
        } catch (leaderboardError) {
          console.log('Could not fetch leaderboard:', leaderboardError);
          this.stats.tournamentStatus = 'Participating';
        }
        
        // Fetch tournament games regardless of leaderboard success
        const games = await this.fetchTournamentGames(tournamentInfo, tournament);
        return games;
        
      } else {
        throw new Error('Tournament not found or access denied');
      }
      
    } catch (error) {
      console.error('Chess.com tournament fetch error:', error);
      
      // Even if tournament API fails, try to get recent games and mark as tournament mode
      this.stats.isInTournament = true;
      this.stats.tournamentName = 'Chess.com Tournament';
      this.stats.tournamentStatus = 'Tournament Mode';
      
      return await this.getRecentTournamentGames();
    }
  }

  async fetchChessComTournamentLeaderboard(tournamentId) {
    // Chess.com doesn't have a direct leaderboard API for all tournaments
    // We'll try a few approaches
    
    try {
      // Approach 1: Try direct tournament standings (may not work for all tournaments)
      const standingsUrl = `https://api.chess.com/pub/tournament/${tournamentId}/standings`;
      const response = await fetch(standingsUrl);
      
      if (response.ok) {
        const data = await response.json();
        console.log('Tournament standings:', data);
        return data;
      }
    } catch (error) {
      console.log('Direct standings approach failed:', error);
    }
    
    // Approach 2: Try to get tournament participants
    try {
      const participantsUrl = `https://api.chess.com/pub/tournament/${tournamentId}/players`;
      const response = await fetch(participantsUrl);
      
      if (response.ok) {
        const data = await response.json();
        console.log('Tournament participants:', data);
        return data;
      }
    } catch (error) {
      console.log('Participants approach failed:', error);
    }
    
    return null;
  }

  findPlayerInLeaderboard(leaderboard, username) {
    const lowerUsername = username.toLowerCase();
    
    // Handle different leaderboard formats
    if (Array.isArray(leaderboard)) {
      for (let i = 0; i < leaderboard.length; i++) {
        const player = leaderboard[i];
        const playerName = player.username || player.player || player.name;
        
        if (playerName && playerName.toLowerCase() === lowerUsername) {
          return {
            rank: i + 1,
            points: player.points || player.score || 0,
            ...player
          };
        }
      }
    } else if (leaderboard.players) {
      return this.findPlayerInLeaderboard(leaderboard.players, username);
    } else if (leaderboard.standings) {
      return this.findPlayerInLeaderboard(leaderboard.standings, username);
    }
    
    return null;
  }

  async fetchTournamentGames(tournamentInfo, tournamentData) {
    // Get games from tournament time period
    try {
      if (tournamentData.start_time) {
        const startTime = new Date(tournamentData.start_time * 1000);
        const endTime = tournamentData.finish_time ? 
          new Date(tournamentData.finish_time * 1000) : 
          new Date(); // If ongoing, use current time
        
        console.log('Fetching games in tournament time range:', startTime, 'to', endTime);
        return await this.getGamesInTimeRange(startTime, endTime);
      }
    } catch (error) {
      console.log('Time range fetch failed:', error);
    }
    
    // Fallback to recent games
    return await this.getRecentTournamentGames();
  }

  extractTournamentGamesFromResults(tournament) {
    // This method would extract game results from tournament data
    // Chess.com API doesn't always provide individual games in tournament results
    // So we'll return empty array and let it fall back to time-based filtering
    console.log('Tournament results:', tournament.results);
    return [];
  }

  async getGamesInTimeRange(startTime, endTime) {
    console.log('Fetching games in time range:', startTime, 'to', endTime);
    
    try {
      // Get games from the months covering the tournament period
      const months = this.getMonthsInRange(startTime, endTime);
      let allGames = [];
      
      for (const month of months) {
        try {
          const response = await chessAPI.getPlayerCompleteMonthlyArchives(
            this.currentUsername, 
            month.year, 
            month.month
          );
          
          if (response && response.body && response.body.games) {
            allGames = allGames.concat(response.body.games);
          }
        } catch (error) {
          console.error('Error fetching games for month:', month, error);
        }
      }
      
      // Filter games to tournament time range
      const tournamentGames = allGames.filter(game => {
        const gameEndTime = new Date(game.end_time * 1000);
        return gameEndTime >= startTime && gameEndTime <= endTime;
      });
      
      console.log('Found', tournamentGames.length, 'games in tournament time range');
      return tournamentGames;
      
    } catch (error) {
      console.error('Error getting games in time range:', error);
      return [];
    }
  }

  getMonthsInRange(startTime, endTime) {
    const months = [];
    const current = new Date(startTime.getFullYear(), startTime.getMonth(), 1);
    const end = new Date(endTime.getFullYear(), endTime.getMonth(), 1);
    
    while (current <= end) {
      months.push({
        year: current.getFullYear(),
        month: current.getMonth() + 1
      });
      current.setMonth(current.getMonth() + 1);
    }
    
    return months;
  }

  async getRecentTournamentGames() {
    // Fallback method: get recent games and assume they're from the tournament
    console.log('Using fallback: recent games approximation');
    
    try {
      const now = new Date();
      const currentMonth = {
        year: now.getFullYear(),
        month: now.getMonth() + 1
      };
      
      const response = await chessAPI.getPlayerCompleteMonthlyArchives(
        this.currentUsername,
        currentMonth.year,
        currentMonth.month
      );
      
      if (response && response.body && response.body.games) {
        const allGames = response.body.games;
        
        // Get games from last 6 hours
        const sixHoursAgo = new Date(now.getTime() - (6 * 60 * 60 * 1000));
        const recentGames = allGames.filter(game => {
          const gameEndTime = new Date(game.end_time * 1000);
          return gameEndTime >= sixHoursAgo;
        });
        
        console.log('Found', recentGames.length, 'recent games');
        
        // If too few games, expand to 24 hours
        if (recentGames.length < 3) {
          const twentyFourHoursAgo = new Date(now.getTime() - (24 * 60 * 60 * 1000));
          const dayGames = allGames.filter(game => {
            const gameEndTime = new Date(game.end_time * 1000);
            return gameEndTime >= twentyFourHoursAgo;
          });
          console.log('Expanding to 24 hours, found', dayGames.length, 'games');
          return dayGames;
        }
        
        return recentGames;
      }
      
      return [];
      
    } catch (error) {
      console.error('Error in fallback method:', error);
      return [];
    }
  }

  async fetchChessComGamesByTimeRange(tournamentData) {
    // Fetch games from current month and filter by approximate time
    const now = new Date();
    const currentMonth = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}`;
    
    const gamesResponse = await fetch(`https://api.chess.com/pub/player/${this.currentUsername}/games/${currentMonth}`);
    if (!gamesResponse.ok) {
      throw new Error('Could not fetch games');
    }
    
    const gamesData = await gamesResponse.json();
    let games = gamesData.games || [];
    
    // If we have tournament data, filter games by time
    if (tournamentData && tournamentData.start_time) {
      const tournamentStart = new Date(tournamentData.start_time * 1000);
      const tournamentEnd = tournamentData.finish_time ? 
        new Date(tournamentData.finish_time * 1000) : 
        new Date(); // If ongoing, use current time
      
      games = games.filter(game => {
        const gameTime = new Date(game.end_time * 1000);
        return gameTime >= tournamentStart && gameTime <= tournamentEnd;
      });
    } else {
      // If no tournament data, show recent games from today
      const today = new Date();
      const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      
      games = games.filter(game => {
        const gameTime = new Date(game.end_time * 1000);
        return gameTime >= todayStart;
      });
    }
    
    return games;
  }

  async fetchChessComRecentGames() {
    console.log('Fetching recent Chess.com games...');
    
    try {
      const now = new Date();
      const currentMonth = {
        year: now.getFullYear(),
        month: now.getMonth() + 1
      };
      
      console.log('Fetching games for current month:', currentMonth);
      
      const response = await chessAPI.getPlayerCompleteMonthlyArchives(
        this.currentUsername,
        currentMonth.year,
        currentMonth.month
      );
      
      if (!response || !response.body || !response.body.games) {
        throw new Error('No games data received');
      }
      
      const games = response.body.games;
      console.log('Total games this month:', games.length);
      
      // Get most recent games (last 20)
      const recentGames = games.slice(-20);
      console.log('Using most recent games:', recentGames.length);
      
      return recentGames;
      
    } catch (error) {
      console.error('Error fetching recent games:', error);
      throw error;
    }
  }

  async fetchLichessTournamentStats(tournamentInfo) {
    // Lichess has better tournament API support
    const tournamentId = tournamentInfo.id;
    
    try {
      // Fetch tournament info
      console.log('Fetching Lichess tournament for ID:', tournamentId);
      const tournamentResponse = await fetch(`https://lichess.org/api/tournament/${tournamentId}`);
      if (!tournamentResponse.ok) {
        throw new Error('Tournament not found');
      }
      
      const tournamentData = await tournamentResponse.json();
      console.log('Lichess tournament data:', tournamentData);
      
      // Update tournament info in stats
      this.stats.tournamentName = tournamentData.fullName || 'Lichess Tournament';
      this.stats.isInTournament = true;
      this.stats.tournamentTotalPlayers = tournamentData.nbPlayers;
      
      // Determine tournament status
      const now = Date.now();
      const startTime = tournamentData.startsAt;
      const finishTime = tournamentData.finishesAt;
      
      if (now < startTime) {
        this.stats.tournamentStatus = 'Upcoming';
      } else if (finishTime && now > finishTime) {
        this.stats.tournamentStatus = 'Finished';
      } else {
        this.stats.tournamentStatus = 'Live';
      }
      
      // Fetch tournament standings to get player position
      try {
        console.log('Fetching tournament standings...');
        const standingsResponse = await fetch(`https://lichess.org/api/tournament/${tournamentId}/standings?nb=200`);
        
        if (standingsResponse.ok) {
          const standings = await standingsResponse.json();
          console.log('Tournament standings:', standings);
          
          // Find the player in standings
          const playerEntry = standings.players?.find(p => 
            p.name.toLowerCase() === this.currentUsername.toLowerCase()
          );
          
          if (playerEntry) {
            this.stats.tournamentPosition = playerEntry.rank;
            this.stats.tournamentPoints = playerEntry.score;
            console.log('Found player position:', playerEntry.rank, 'with score:', playerEntry.score);
          } else {
            console.log('Player not found in standings - may not have started playing yet');
            this.stats.tournamentPosition = null;
            this.stats.tournamentPoints = 0;
          }
        }
      } catch (standingsError) {
        console.log('Could not fetch standings:', standingsError);
        this.stats.tournamentPosition = null;
        this.stats.tournamentPoints = 0;
      }
      
      // Fetch tournament games for the user
      console.log('Fetching tournament games...');
      const gamesResponse = await fetch(`https://lichess.org/api/tournament/${tournamentId}/games/${this.currentUsername}`);
      if (!gamesResponse.ok) {
        console.log('No games found for this tournament yet');
        return []; // Player hasn't played any games yet
      }
      
      const gamesText = await gamesResponse.text();
      const games = gamesText.trim().split('\n').map(line => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      }).filter(game => game !== null);
      
      console.log('Found', games.length, 'tournament games');
      return games;
      
    } catch (error) {
      console.error('Lichess tournament API error:', error);
      
      // Even if tournament API fails, try to mark as tournament mode
      this.stats.isInTournament = true;
      this.stats.tournamentName = 'Lichess Tournament';
      this.stats.tournamentStatus = 'Tournament Mode';
      
      throw error;
    }
  }

  // Helper functions for tournament detection and rating selection
  async fetchCurrentLichessTournaments() {
    try {
      // Check if user is currently in any tournaments by looking at their recent activity
      const response = await fetch(`https://lichess.org/api/user/${this.currentUsername}/activity?nb=20`);
      if (!response.ok) {
        return [];
      }
      
      const activities = await response.json();
      const now = Date.now();
      const currentTournaments = [];
      
      // Look for recent tournament activities
      for (const activity of activities) {
        if (activity.tournaments) {
          for (const tournament of activity.tournaments) {
            // Check if tournament is currently active (within last 4 hours)
            const tournamentTime = new Date(tournament.date).getTime();
            const hoursSinceStart = (now - tournamentTime) / (1000 * 60 * 60);
            
            if (hoursSinceStart < 4) {
              // Fetch full tournament details
              try {
                const tournamentResponse = await fetch(`https://lichess.org/api/tournament/${tournament.id}`);
                if (tournamentResponse.ok) {
                  const tournamentData = await tournamentResponse.json();
                  
                  // Check if tournament is still active
                  const startTime = tournamentData.startsAt;
                  const finishTime = tournamentData.finishesAt;
                  
                  if (now >= startTime && (!finishTime || now <= finishTime)) {
                    currentTournaments.push(tournamentData);
                  }
                }
              } catch (error) {
                console.log('Error fetching tournament details:', error);
              }
            }
          }
        }
      }
      
      return currentTournaments;
    } catch (error) {
      console.log('Error fetching current tournaments:', error);
      return [];
    }
  }

  getLichessTournamentStatus(tournament) {
    const now = Date.now();
    const startTime = tournament.startsAt;
    const finishTime = tournament.finishesAt;
    
    if (now < startTime) {
      return 'Upcoming';
    } else if (finishTime && now > finishTime) {
      return 'Finished';
    } else {
      return 'Live';
    }
  }

  async fetchLichessTournamentStandings(tournamentId) {
    const response = await fetch(`https://lichess.org/api/tournament/${tournamentId}/standings?nb=200`);
    if (!response.ok) {
      throw new Error('Could not fetch tournament standings');
    }
    return await response.json();
  }

  async fetchLichessTournamentGames(tournamentId) {
    const response = await fetch(`https://lichess.org/api/tournament/${tournamentId}/games/${this.currentUsername}`);
    if (!response.ok) {
      return [];
    }
    
    const gamesText = await response.text();
    const games = gamesText.trim().split('\n').map(line => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    }).filter(game => game !== null);
    
    return games;
  }

  getRatingByTournamentType(profile, tournamentType) {
    if (!profile.perfs) return 1500;
    
    switch (tournamentType) {
      case 'bullet':
        return profile.perfs.bullet?.rating || 1500;
      case 'blitz':
        return profile.perfs.blitz?.rating || 1500;
      case 'rapid':
        return profile.perfs.rapid?.rating || 1500;
      case 'classical':
        return profile.perfs.classical?.rating || 1500;
      default:
        return profile.perfs.blitz?.rating || 
               profile.perfs.rapid?.rating || 
               profile.perfs.classical?.rating || 1500;
    }
  }

  // Chess.com tournament detection helpers
  async fetchCurrentChessComTournaments() {
    try {
      // First, get player's current tournament participation status
      const profileResponse = await chessAPI.getPlayer(this.currentUsername);
      if (!profileResponse || !profileResponse.body) {
        return [];
      }
      
      // Get player's tournament history to find recent/current tournaments
      const tournamentsResponse = await chessAPI.getPlayerTournaments(this.currentUsername);
      if (!tournamentsResponse || !tournamentsResponse.body) {
        return [];
      }
      
      const tournaments = tournamentsResponse.body;
      const now = Date.now();
      const activeTournaments = [];
      
      // Check recent tournaments for active ones
      for (const tournament of tournaments.slice(0, 10)) { // Check last 10 tournaments
        if (tournament.url) {
          const tournamentId = this.extractTournamentIdFromUrl(tournament.url);
          if (tournamentId) {
            try {
              // Get detailed tournament information
              const tournamentResponse = await this.fetchTournamentDetails(tournamentId);
              if (tournamentResponse) {
                const tournamentData = tournamentResponse;
                
                // Check if tournament is currently active
                const startTime = tournamentData.start_time ? new Date(tournamentData.start_time * 1000).getTime() : 0;
                const endTime = tournamentData.finish_time ? 
                  new Date(tournamentData.finish_time * 1000).getTime() : 
                  now + 86400000; // Default to 24h if no end time
                
                // Tournament is active if we're between start and end time
                if (now >= startTime && now <= endTime) {
                  activeTournaments.push({
                    id: tournamentId,
                    name: tournamentData.name || 'Chess.com Tournament',
                    url: tournament.url,
                    startTime: startTime,
                    endTime: endTime,
                    ...tournamentData
                  });
                }
              }
            } catch (error) {
              console.log('Error checking tournament:', tournamentId, error);
            }
          }
        }
      }
      
      console.log('Found active tournaments:', activeTournaments);
      return activeTournaments;
    } catch (error) {
      console.log('Error fetching current Chess.com tournaments:', error);
      return [];
    }
  }

  async fetchTournamentDetails(tournamentId) {
    try {
      // Try the main tournament API endpoint
      const response = await fetch(`https://api.chess.com/pub/tournament/${tournamentId}`);
      if (response.ok) {
        return await response.json();
      }
      
      // If that fails, try the chess-web-api
      const apiResponse = await chessAPI.getTournament(tournamentId);
      if (apiResponse && apiResponse.body) {
        return apiResponse.body;
      }
      
      return null;
    } catch (error) {
      console.log('Error fetching tournament details:', error);
      return null;
    }
  }

  extractTournamentIdFromUrl(url) {
    const match = url.match(/\/(?:tournament|arena)\/(\d+)/);
    return match ? match[1] : null;
  }

  detectChessComTournamentType(tournament) {
    // Try to determine tournament type from name or other properties
    const name = (tournament.name || '').toLowerCase();
    
    if (name.includes('bullet')) return 'bullet';
    if (name.includes('blitz')) return 'blitz';
    if (name.includes('rapid')) return 'rapid';
    if (name.includes('daily')) return 'daily';
    
    // Default to blitz if can't determine
    return 'blitz';
  }

  getChessComRatingByType(stats, tournamentType) {
    switch (tournamentType) {
      case 'bullet':
        return stats.chess_bullet?.last?.rating || 1200;
      case 'blitz':
        return stats.chess_blitz?.last?.rating || 1200;
      case 'rapid':
        return stats.chess_rapid?.last?.rating || 1200;
      case 'daily':
        return stats.chess_daily?.last?.rating || 1200;
      default:
        return stats.chess_blitz?.last?.rating || 
               stats.chess_rapid?.last?.rating || 
               stats.chess_bullet?.last?.rating || 1200;
    }
  }

  async fetchChessComTournamentData(tournamentId) {
    try {
      // First try to get basic tournament info
      const tournamentInfo = await this.fetchTournamentDetails(tournamentId);
      if (!tournamentInfo) {
        return null;
      }

      // Try to get tournament leaderboard/standings
      let leaderboard = [];
      let totalPlayers = 0;

      // Method 1: Try direct leaderboard endpoint
      try {
        const leaderboardResponse = await fetch(`https://api.chess.com/pub/tournament/${tournamentId}/standings`);
        if (leaderboardResponse.ok) {
          const leaderboardData = await leaderboardResponse.json();
          console.log('Tournament leaderboard:', leaderboardData);
          
          if (leaderboardData.standings) {
            leaderboard = leaderboardData.standings;
            totalPlayers = leaderboard.length;
          } else if (Array.isArray(leaderboardData)) {
            leaderboard = leaderboardData;
            totalPlayers = leaderboard.length;
          }
        }
      } catch (leaderboardError) {
        console.log('Direct leaderboard fetch failed:', leaderboardError);
      }

      // Method 2: Try getting participants list
      if (leaderboard.length === 0) {
        try {
          const participantsResponse = await fetch(`https://api.chess.com/pub/tournament/${tournamentId}/players`);
          if (participantsResponse.ok) {
            const participantsData = await participantsResponse.json();
            console.log('Tournament participants:', participantsData);
            
            if (participantsData.players) {
              leaderboard = participantsData.players.map((player, index) => ({
                username: player.username || player.name,
                score: player.score || 0,
                rank: index + 1,
                ...player
              }));
              totalPlayers = leaderboard.length;
            }
          }
        } catch (participantsError) {
          console.log('Participants fetch failed:', participantsError);
        }
      }

      // Method 3: Use chess-web-api as fallback
      if (leaderboard.length === 0) {
        try {
          const apiResponse = await chessAPI.getTournament(tournamentId);
          if (apiResponse && apiResponse.body) {
            const tournamentData = apiResponse.body;
            
            if (tournamentData.leaderboard) {
              leaderboard = tournamentData.leaderboard;
              totalPlayers = tournamentData.total_players || leaderboard.length;
            }
          }
        } catch (apiError) {
          console.log('Chess API tournament fetch failed:', apiError);
        }
      }

      return {
        ...tournamentInfo,
        totalPlayers: totalPlayers,
        leaderboard: leaderboard
      };
    } catch (error) {
      console.log('Error fetching Chess.com tournament data:', error);
      return null;
    }
  }

  async getTournamentOnlyGames(tournament) {
    console.log('Fetching tournament-only games for tournament:', tournament.id);
    
    try {
      // Method 1: Try to get tournament rounds/games directly
      const roundGames = await this.fetchTournamentGamesByRounds(tournament.id);
      if (roundGames && roundGames.length > 0) {
        console.log('Found', roundGames.length, 'games via tournament rounds');
        return roundGames;
      }
      
      // Method 2: Get games from tournament time period and filter by tournament context
      if (tournament.startTime && tournament.endTime) {
        const timeFilteredGames = await this.getGamesInTimeRange(
          new Date(tournament.startTime),
          new Date(tournament.endTime)
        );
        
        // Further filter to ensure these are tournament games
        const filteredTournamentGames = timeFilteredGames.filter(game => {
          // Check if game has tournament context indicators
          return this.isTournamentGame(game, tournament);
        });
        
        console.log('Found', filteredTournamentGames.length, 'tournament games via time filtering');
        return filteredTournamentGames;
      }
      
      // Method 3: Fallback to recent games with tournament indicators
      const recentGames = await this.fetchChessComRecentGames();
      const recentTournamentGames = recentGames.filter(game => {
        return this.isTournamentGame(game, tournament);
      });
      
      console.log('Found', recentTournamentGames.length, 'tournament games via recent filtering');
      return recentTournamentGames;
      
    } catch (error) {
      console.error('Error fetching tournament-only games:', error);
      return [];
    }
  }

  async fetchTournamentGamesByRounds(tournamentId) {
    try {
      // Try to get tournament rounds
      const roundsResponse = await fetch(`https://api.chess.com/pub/tournament/${tournamentId}/rounds`);
      if (!roundsResponse.ok) {
        return [];
      }
      
      const roundsData = await roundsResponse.json();
      console.log('Tournament rounds:', roundsData);
      
      const allTournamentGames = [];
      
      // Get games from each round
      if (roundsData.rounds) {
        for (const round of roundsData.rounds) {
          try {
            const roundGamesResponse = await fetch(round.games);
            if (roundGamesResponse.ok) {
              const roundGames = await roundGamesResponse.json();
              
              // Filter games where this user participated
              const userGames = roundGames.games?.filter(game => {
                const whiteUsername = game.white?.username?.toLowerCase();
                const blackUsername = game.black?.username?.toLowerCase();
                const currentUser = this.currentUsername.toLowerCase();
                
                return whiteUsername === currentUser || blackUsername === currentUser;
              }) || [];
              
              allTournamentGames.push(...userGames);
            }
          } catch (roundError) {
            console.log('Error fetching round games:', roundError);
          }
        }
      }
      
      return allTournamentGames;
    } catch (error) {
      console.log('Error fetching tournament rounds:', error);
      return [];
    }
  }

  isTournamentGame(game, tournament) {
    // Check various indicators that this game is part of the tournament
    
    // 1. Time-based check - game should be within tournament timeframe
    if (tournament.startTime && tournament.endTime) {
      const gameTime = new Date(game.end_time * 1000).getTime();
      if (gameTime < tournament.startTime || gameTime > tournament.endTime) {
        return false;
      }
    }
    
    // 2. Check for tournament metadata in the game
    if (game.tournament) {
      return true; // Game has tournament field
    }
    
    // 3. Check if game URL contains tournament reference
    if (game.url && tournament.url) {
      const tournamentId = this.extractTournamentIdFromUrl(tournament.url);
      if (tournamentId && game.url.includes(tournamentId)) {
        return true;
      }
    }
    
    // 4. Check game rules/time control matches tournament
    if (tournament.time_control && game.time_control) {
      // Compare time controls to see if they match
      if (this.timeControlsMatch(tournament.time_control, game.time_control)) {
        return true;
      }
    }
    
    // 5. If game is very recent (last 2 hours) and user is in tournament, likely a tournament game
    if (tournament.startTime) {
      const gameTime = new Date(game.end_time * 1000).getTime();
      const now = Date.now();
      const twoHoursAgo = now - (2 * 60 * 60 * 1000);
      
      if (gameTime >= twoHoursAgo && gameTime >= tournament.startTime) {
        return true;
      }
    }
    
    return false;
  }

  timeControlsMatch(tournamentTimeControl, gameTimeControl) {
    // Simple comparison of time controls
    // This is a basic implementation - could be improved
    try {
      if (typeof tournamentTimeControl === 'string' && typeof gameTimeControl === 'string') {
        return tournamentTimeControl.toLowerCase().includes(gameTimeControl.toLowerCase()) ||
               gameTimeControl.toLowerCase().includes(tournamentTimeControl.toLowerCase());
      }
      
      // For object-based time controls, compare base time
      if (tournamentTimeControl.base_time && gameTimeControl.base_time) {
        return tournamentTimeControl.base_time === gameTimeControl.base_time;
      }
    } catch (error) {
      console.log('Error comparing time controls:', error);
    }
    
    return false;
  }

  updateLastUpdatedTime() {
    const lastUpdatedElement = document.getElementById('last-updated');
    if (lastUpdatedElement && this.stats.lastUpdated) {
      const now = new Date();
      const timeDiff = now.getTime() - this.stats.lastUpdated.getTime();
      const seconds = Math.floor(timeDiff / 1000);
      
      let timeText = '';
      if (seconds < 60) {
        timeText = `${seconds}s ago`;
      } else if (seconds < 3600) {
        const minutes = Math.floor(seconds / 60);
        timeText = `${minutes}m ago`;
      } else {
        const hours = Math.floor(seconds / 3600);
        timeText = `${hours}h ago`;
      }
      
      lastUpdatedElement.textContent = timeText;
    }
  }
  
  bindSponsorEvents() {
    const sponsorUpload = document.getElementById('sponsor-upload');
    const sponsorFile = document.getElementById('sponsor-file');
    const changeSponsor = document.getElementById('change-sponsor');
    const removeSponsor = document.getElementById('remove-sponsor');
    const showSponsorCheckbox = document.getElementById('show-sponsor');
    
    if (sponsorUpload && sponsorFile) {
      sponsorUpload.addEventListener('click', () => {
        sponsorFile.click();
      });
      
      sponsorFile.addEventListener('change', (e) => {
        this.handleSponsorUpload(e);
      });
    }
    
    if (changeSponsor) {
      changeSponsor.addEventListener('click', () => {
        sponsorFile?.click();
      });
    }
    
    if (removeSponsor) {
      removeSponsor.addEventListener('click', () => {
        this.removeSponsorImage();
      });
    }
    
    if (showSponsorCheckbox) {
      showSponsorCheckbox.addEventListener('change', (e) => {
        this.toggleSponsorSection(e.target.checked);
      });
    }
  }
  
  handleSponsorUpload(event) {
    const file = event.target.files[0];
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        this.setSponsorImage(e.target.result);
      };
      reader.readAsDataURL(file);
    }
  }
  
  setSponsorImage(imageSrc) {
    const sponsorImage = document.getElementById('sponsor-image');
    const sponsorUpload = document.getElementById('sponsor-upload');
    const sponsorDisplay = document.getElementById('sponsor-display');
    const lastGamesSection = document.querySelector('.last-games');

    if (
      sponsorImage &&
      sponsorUpload &&
      sponsorDisplay &&
      lastGamesSection
    ) {
      sponsorImage.setAttribute('src', imageSrc);
      sponsorUpload.style.display = 'none';
      sponsorDisplay.style.display = 'block';

      // Move sponsor section below "Last 10 Games"
      const sponsorSection = document.getElementById('sponsor-section');
      if (sponsorSection) {
        lastGamesSection.insertAdjacentElement('afterend', sponsorSection);
      }

      // Save to localStorage
      localStorage.setItem('chess-widget-sponsor', imageSrc);
    }
  }
  
  removeSponsorImage() {
    const sponsorUpload = document.getElementById('sponsor-upload');
    const sponsorDisplay = document.getElementById('sponsor-display');
    
    if (sponsorUpload && sponsorDisplay) {
      sponsorUpload.style.display = 'flex';
      sponsorDisplay.style.display = 'none';
      
      // Remove from localStorage
      localStorage.removeItem('chess-widget-sponsor');
    }
  }
  
  toggleSponsorSection(show) {
    const sponsorSection = document.getElementById('sponsor-section');
    if (sponsorSection) {
      sponsorSection.style.display = show ? 'block' : 'none';
    }
    
    // Save preference
    const config = JSON.parse(localStorage.getItem('chess-widget-config') || '{}');
    config.showSponsor = show;
    localStorage.setItem('chess-widget-config', JSON.stringify(config));
  }
  
  loadSponsorSettings() {
    const savedSponsor = localStorage.getItem('chess-widget-sponsor');
    if (savedSponsor) {
      this.setSponsorImage(savedSponsor);
    }

    const config = JSON.parse(localStorage.getItem('chess-widget-config') || '{}');
    const showSponsorCheckbox = getElementByIdSafe('show-sponsor');
    const showSponsor = config.showSponsor || false;

    if (showSponsorCheckbox && showSponsorCheckbox.tagName === 'INPUT') {
      showSponsorCheckbox.checked = showSponsor;
    }
    this.toggleSponsorSection(showSponsor);
  }
}

// Add debug function to window for testing
window.debugChessWidget = function() {
  const widget = window.chessWidget;
  if (widget) {
    console.log('Widget state:', {
      platform: widget.currentPlatform,
      username: widget.currentUsername,
      tournamentLink: widget.tournamentLink,
      stats: widget.stats
    });

    // Test API calls
    if (widget.currentPlatform === 'chess.com') {
      console.log('Testing Chess.com API...');
      fetch(`https://api.chess.com/pub/player/${widget.currentUsername}`)
        .then(r => r.json())
        .then(data => console.log('Profile data:', data))
        .catch(e => console.error('Profile error:', e));

      fetch(`https://api.chess.com/pub/player/${widget.currentUsername}/stats`)
        .then(r => r.json())
        .then(data => console.log('Stats data:', data))
        .catch(e => console.error('Stats error:', e));
    }
  }
};

// Initialize the widget when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  // Attach chessWidget to the global window object
  if (!window.chessWidget) {
    window.chessWidget = new ChessWidget();
  }

  // Check if lucide is available and initialize icons
  if (window.lucide.createIcons) {
    window.lucide.createIcons();
  }
});

// Re-initialize icons when UI updates
function refreshIcons() {
  if (window.lucide.createIcons) {
    window.lucide.createIcons();
  }
}

// Safe DOM access helper
function getElementByIdSafe(id) {
  const element = document.getElementById(id);
  if (!element) {
    console.warn(`Element with ID '${id}' not found.`);
  }
  return element;
}
