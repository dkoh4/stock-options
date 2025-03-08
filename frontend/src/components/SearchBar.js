import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import styled from 'styled-components';

const SearchContainer = styled.div`
  position: relative;
  width: 300px;
`;

const SearchInput = styled.input`
  width: 100%;
  padding: 10px 15px;
  border: 1px solid #333;
  border-radius: 4px;
  background-color: #2c2c2c;
  color: var(--text-primary);
  font-size: 16px;
  outline: none;
  
  &:focus {
    border-color: var(--accent-color);
  }
`;

const SearchResults = styled.ul`
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin: 0;
  padding: 0;
  list-style: none;
  background-color: #2c2c2c;
  border: 1px solid #333;
  border-radius: 0 0 4px 4px;
  max-height: 200px;
  overflow-y: auto;
  z-index: 9999;
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
`;

const SearchResultItem = styled.li`
  padding: 10px 15px;
  cursor: pointer;
  
  &:hover {
    background-color: #3c3c3c;
  }
`;

const NoResultsMessage = styled.div`
  padding: 10px 15px;
  color: #b3b3b3;
  font-style: italic;
`;

const SearchBar = ({ onTickerSelect }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [showResults, setShowResults] = useState(false);
  const searchRef = useRef(null);

  useEffect(() => {
    const handleClickOutside = (event) => {
      if (searchRef.current && !searchRef.current.contains(event.target)) {
        setShowResults(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const searchTickers = async (searchQuery) => {
    if (!searchQuery.trim()) {
      setResults([]);
      return;
    }

    try {
      const response = await axios.get(`/api/search/${searchQuery}`);
      setResults(response.data);
    } catch (error) {
      console.error('Error searching tickers:', error);
      setResults([]);
    }
  };

  const handleInputChange = (e) => {
    const value = e.target.value;
    setQuery(value);
    
    if (value.trim()) {
      searchTickers(value);
      setShowResults(true);
    } else {
      setResults([]);
      setShowResults(false);
    }
  };

  const handleSelectTicker = (ticker) => {
    setQuery(ticker);
    setShowResults(false);
    onTickerSelect(ticker);
  };

  const handleKeyDown = (e) => {
    // If Enter key is pressed, use the current input as a ticker
    if (e.key === 'Enter' && query.trim()) {
      setShowResults(false);
      onTickerSelect(query.trim().toUpperCase());
    }
  };

  return (
    <SearchContainer ref={searchRef}>
      <SearchInput
        type="text"
        placeholder="Enter any ticker symbol (e.g., AAPL)"
        value={query}
        onChange={handleInputChange}
        onKeyDown={handleKeyDown}
        onFocus={() => query.trim() && setShowResults(true)}
      />
      {showResults && query.trim() && (
        <SearchResults>
          {results.length > 0 ? (
            results.map((ticker, index) => (
              <SearchResultItem
                key={index}
                onClick={() => handleSelectTicker(ticker)}
              >
                {ticker}
              </SearchResultItem>
            ))
          ) : (
            <NoResultsMessage>
              No matching tickers found in database. Press Enter to search for "{query.toUpperCase()}".
            </NoResultsMessage>
          )}
        </SearchResults>
      )}
    </SearchContainer>
  );
};

export default SearchBar; 