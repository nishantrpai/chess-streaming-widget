import './style.css'
import ChessWebAPI from 'chess-web-api'

// Initialize Chess.com API client
const chessAPI = new ChessWebAPI();

// Chess Widget Application
class ChessWidget {
  constructor() {
    this.currentPlatform = 'lichess';
    this.currentUsername = '';
    this.tournamentLink = '';
    this.refreshInterval = null; // For auto-refresh
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
      isInTournament: false
    };
    this.init();
  }

  init() {
    this.bindEvents();
    this.loadStoredConfig();
  }

  bindEvents() {
    const startBtn = document.getElementById('start-tracking');
    const refreshBtn = document.getElementById('refresh-stats');
    const backBtn = document.getElementById('back-to-config');

    startBtn.addEventListener('click', () => this.startTracking());
    refreshBtn.addEventListener('click', () => this.refreshStats());
    backBtn.addEventListener('click', () => this.backToConfig());
  }

  loadStoredConfig() {
    const stored = localStorage.getItem('chess-widget-config');
    if (stored) {
      const config = JSON.parse(stored);
      document.getElementById('platform').value = config.platform || 'lichess';
      document.getElementById('username').value = config.username || '';
      document.getElementById('tournament-link').value = config.tournamentLink || '';
      
      if (config.username) {
        this.currentPlatform = config.platform;
        this.currentUsername = config.username;
        this.tournamentLink = config.tournamentLink;
        this.showStatsScreen();
        this.refreshStats();
      }
    }
  }

  saveConfig() {
    const config = {
      platform: this.currentPlatform,
      username: this.currentUsername,
      tournamentLink: this.tournamentLink
    };
    localStorage.setItem('chess-widget-config', JSON.stringify(config));
  }

  async startTracking() {
    const platform = document.getElementById('platform').value;
    const username = document.getElementById('username').value.trim();
    const tournamentLink = document.getElementById('tournament-link').value.trim();

    if (!username) {
      this.showError('Please enter a username');
      return;
    }

    this.currentPlatform = platform;
    this.currentUsername = username;
    this.tournamentLink = tournamentLink;
    
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
      
      // Set up auto-refresh for tournament mode
      const tournamentInfo = this.parseTournamentUrl(this.tournamentLink);
      if (tournamentInfo) {
        this.startAutoRefresh();
      } else {
        this.stopAutoRefresh();
      }
      
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
    
    // Refresh every 30 seconds in tournament mode
    this.refreshInterval = setInterval(() => {
      this.refreshStats();
    }, 30000);
    
    // Update UI to show tournament mode
    this.updateTournamentModeUI(true);
  }

  stopAutoRefresh() {
    if (this.refreshInterval) {
      clearInterval(this.refreshInterval);
      this.refreshInterval = null;
    }
    this.updateTournamentModeUI(false);
  }

  updateTournamentModeUI(isTournamentMode) {
    const refreshBtn = document.getElementById('refresh-stats');
    if (refreshBtn) {
      if (isTournamentMode) {
        refreshBtn.textContent = 'Live Mode';
        refreshBtn.style.background = '#4ade80';
        refreshBtn.title = 'Auto-refreshing every 30 seconds';
      } else {
        refreshBtn.textContent = 'Refresh';
        refreshBtn.style.background = '';
        refreshBtn.title = 'Click to refresh stats';
      }
    }
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
    // Check if we have a tournament link
    const tournamentInfo = this.parseTournamentUrl(this.tournamentLink);
    
    if (tournamentInfo && tournamentInfo.platform === 'lichess') {
      // Fetch tournament-specific stats
      try {
        const games = await this.fetchLichessTournamentStats(tournamentInfo);
        
        // Get user rating from profile
        const profileResponse = await fetch(`https://lichess.org/api/user/${this.currentUsername}`);
        const profile = profileResponse.ok ? await profileResponse.json() : {};
        const rating = profile.perfs?.classical?.rating || 
                      profile.perfs?.rapid?.rating || 
                      profile.perfs?.blitz?.rating || 1500;
        
        this.processGames(games, 'lichess', rating);
        return;
      } catch (error) {
        console.error('Tournament fetch failed, falling back to recent games:', error);
      }
    }
    
    // Fallback to regular profile stats
    const profileResponse = await fetch(`https://lichess.org/api/user/${this.currentUsername}`);
    if (!profileResponse.ok) {
      throw new Error('User not found');
    }
    const profile = await profileResponse.json();

    // Get classical rating (or rapid if classical not available)
    const rating = profile.perfs?.classical?.rating || 
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
    console.log('Tournament link:', this.tournamentLink);
    
    try {
      // Check if we have a tournament link
      const tournamentInfo = this.parseTournamentUrl(this.tournamentLink);
      console.log('Tournament info:', tournamentInfo);
      
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

      // Get rating from rapid, blitz, or daily
      const rating = stats.chess_rapid?.last?.rating || 
                    stats.chess_blitz?.last?.rating || 
                    stats.chess_bullet?.last?.rating ||
                    stats.chess_daily?.last?.rating || 1200;
      
      console.log('Using rating:', rating);

      let games = [];
      
      if (tournamentInfo && tournamentInfo.platform === 'chess.com') {
        // Fetch tournament-specific games
        console.log('Fetching tournament-specific games...');
        try {
          games = await this.fetchChessComTournamentStats(tournamentInfo);
          console.log('Tournament games fetched:', games.length);
        } catch (error) {
          console.error('Tournament fetch failed, falling back to recent games:', error);
          games = await this.fetchChessComRecentGames();
        }
      } else {
        // Fetch regular recent games
        console.log('Fetching recent games...');
        games = await this.fetchChessComRecentGames();
      }
      
      console.log('Processing games:', games.length);
      this.processGames(games, 'chess.com', rating);
    } catch (error) {
      console.error('Chess.com API error:', error);
      // Show more specific error info
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

    // Preserve tournament info when updating stats
    const existingTournamentInfo = {
      tournamentPosition: this.stats.tournamentPosition,
      tournamentPoints: this.stats.tournamentPoints,
      tournamentTotalPlayers: this.stats.tournamentTotalPlayers,
      tournamentStatus: this.stats.tournamentStatus,
      tournamentName: this.stats.tournamentName,
      isInTournament: this.stats.isInTournament
    };

    this.stats = {
      rating,
      wins,
      losses,
      draws,
      winRate,
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
    const tournamentInfo = this.parseTournamentUrl(this.tournamentLink);
    this.updateTournamentInfo(tournamentInfo);
    
    // Update rating
    document.getElementById('rating').textContent = this.stats.rating;

    // Update wins/losses
    document.getElementById('wins').textContent = this.stats.wins;
    document.getElementById('losses').textContent = this.stats.losses;

    // Update win rate
    document.getElementById('win-percentage').textContent = `${this.stats.winRate}%`;
    document.getElementById('record-wins').textContent = `${this.stats.wins}W`;
    document.getElementById('record-losses').textContent = `${this.stats.losses}L`;

    // Update streak
    const streakText = this.stats.currentStreak > 0 
      ? `${this.stats.currentStreak} ${this.stats.streakType.toUpperCase()} STREAK`
      : 'NO STREAK';
    document.getElementById('streak').textContent = streakText;

    // Update last 10 games
    this.updateGamesGrid();
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

  updateTournamentInfo(tournamentInfo) {
    const tournamentInfoDiv = document.getElementById('tournament-info');
    const tournamentName = document.getElementById('tournament-name');
    const tournamentStatus = document.getElementById('tournament-status');
    const tournamentRank = document.getElementById('tournament-rank');
    const tournamentTotal = document.getElementById('tournament-total');
    const tournamentPoints = document.getElementById('tournament-points');
    const ratingLabel = document.getElementById('rating-label');
    
    if (tournamentInfo && this.stats.isInTournament) {
      // Show tournament section
      if (tournamentInfoDiv) tournamentInfoDiv.style.display = 'block';
      if (ratingLabel) ratingLabel.textContent = 'TOURNAMENT RATING';
      
      // Set tournament name with highlighting
      if (tournamentName) {
        tournamentName.textContent = this.stats.tournamentName || `${tournamentInfo.platform.toUpperCase()} Tournament`;
        
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
  window.chessWidget = new ChessWidget();
});

// Service Worker registration for PWA
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js')
      .then(registration => {
        console.log('SW registered: ', registration);
      })
      .catch(registrationError => {
        console.log('SW registration failed: ', registrationError);
      });
  });
}
