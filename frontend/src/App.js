import React, { useState, useEffect } from 'react';
import './styles/App.css';
import StockChart from './components/StockChart';
import SearchBar from './components/SearchBar';

function App() {
  // Initialize ticker from localStorage or use SPY as default
  const [selectedTicker, setSelectedTicker] = useState(() => {
    return localStorage.getItem('selectedTicker') || 'SPY';
  });

  // Save ticker to localStorage whenever it changes
  useEffect(() => {
    localStorage.setItem('selectedTicker', selectedTicker);
  }, [selectedTicker]);

  const handleTickerSelect = (ticker) => {
    setSelectedTicker(ticker);
  };

  return (
    <div className="App">
      <header className="App-header">
        <h1>Stock Options Viewer</h1>
        <SearchBar onTickerSelect={handleTickerSelect} />
      </header>
      <main className="App-main">
        <StockChart ticker={selectedTicker} />
      </main>
    </div>
  );
}

export default App; 