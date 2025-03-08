import React, { useEffect, useRef, useState } from 'react';
import { createChart } from 'lightweight-charts';
import styled from 'styled-components';
import axios from 'axios';
import OptionChain from './OptionChain';

const ChartContainer = styled.div`
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  position: relative;
`;

const ChartHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 20px;
  background-color: #0e1621;
  color: #fff;
`;

const PriceInfo = styled.div`
  display: flex;
  flex-direction: column;
`;

const TickerSymbol = styled.div`
  font-size: 1.5rem;
  font-weight: bold;
  margin-bottom: 5px;
`;

const PriceDisplay = styled.div`
  display: flex;
  align-items: center;
`;

const PriceValue = styled.span`
  font-size: 1.2rem;
  margin-right: 10px;
`;

const PriceChange = styled.span`
  color: ${props => props.isPositive ? '#26a69a' : '#ef5350'};
  font-size: 1rem;
`;

const ToggleButton = styled.button`
  background-color: #333;
  color: #fff;
  border: none;
  padding: 8px 15px;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.2s;
  
  &:hover {
    background-color: #444;
  }
`;

const ChartWrapper = styled.div`
  flex: 1;
  position: relative;
  transition: height 0.3s ease;
  min-height: 200px;
`;

const OptionChainOverlay = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(14, 22, 33, 0.97);
  z-index: 5;
  display: flex;
  flex-direction: column;
  overflow: auto;
  max-height: calc(100% - 150px);
  border-top: 1px solid #4c9aff;
  box-shadow: 0px -2px 10px rgba(0, 0, 0, 0.3);
`;

const LoadingOverlay = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(14, 22, 33, 0.9);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  z-index: 100;
`;

const LoadingSpinner = styled.div`
  border: 5px solid #2a3245;
  border-top: 5px solid #4c9aff;
  border-radius: 50%;
  width: 50px;
  height: 50px;
  animation: spin 2s linear infinite;
  
  @keyframes spin {
    0% { transform: rotate(0deg); }
    100% { transform: rotate(360deg); }
  }
`;

const LoadingText = styled.div`
  margin-top: 15px;
  color: #fff;
  font-size: 16px;
`;

// Add a styled component for the options chain header
const OptionChainHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px 20px;
  background-color: #1a2130;
  border-bottom: 1px solid #2a3245;
  position: sticky;
  top: 0;
  z-index: 10;
`;

// Add some basic styles for the OptionChain content
const OptionChainContent = styled.div`
  padding: 10px;
  overflow: auto;
  flex: 1;
`;

// Add styled components for error messages
const ErrorOverlay = styled.div`
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  background-color: rgba(14, 22, 33, 0.95);
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  z-index: 100;
  padding: 20px;
  text-align: center;
`;

const ErrorIcon = styled.div`
  color: #ef5350;
  font-size: 48px;
  margin-bottom: 20px;
`;

const ErrorTitle = styled.h3`
  color: #ef5350;
  margin-bottom: 10px;
  font-size: 24px;
`;

const ErrorMessage = styled.p`
  color: #fff;
  margin-bottom: 20px;
  font-size: 16px;
  max-width: 80%;
`;

const StyledButton = styled.button`
  background-color: #4c9aff;
  color: white;
  border: none;
  padding: 10px 20px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 16px;
  
  &:hover {
    background-color: #3a7bd5;
  }
`;

const StockChart = ({ ticker }) => {
  // Chart references
  const chartRef = useRef(null);
  const chartContainer = useRef(null);
  const candleSeriesRef = useRef(null);
  
  // State
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [priceInfo, setPriceInfo] = useState({
    price: 0,
    change: 0,
    percentChange: 0
  });
  const [showOptionChain, setShowOptionChain] = useState(false);
  
  // Add a reference to store chart dimensions
  const chartDimensions = useRef({ width: 0, height: 0 });
  
  // Fetch data when ticker changes
  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchData();
    
    // Clean up chart on unmount or ticker change
    return () => {
      if (chartRef.current) {
        chartRef.current.remove();
        chartRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticker]); // fetchData is intentionally omitted as it would cause an infinite loop
  
  // Fetch price data from API
  const fetchData = async () => {
    try {
      const response = await axios.get(`/api/prices/${ticker}`);
      const data = response.data;
      
      if (data.length === 0) {
        setError({ 
          title: 'No Data Available',
          message: `No price data found for ticker ${ticker}. Please check the symbol and try again.`
        });
        setLoading(false);
        return;
      }
      
      // Calculate price change info
      const latestPrice = data[data.length - 1];
      const previousPrice = data[data.length - 2] || latestPrice;
      
      const priceValue = parseFloat(latestPrice.close);
      const previousValue = parseFloat(previousPrice.close);
      const change = priceValue - previousValue;
      const percentChange = (change / previousValue) * 100;
      
      setPriceInfo({
        price: priceValue,
        change: change,
        percentChange: percentChange
      });
      
      // Process data for chart display
      const processedData = data.map(item => ({
        time: item.time,
        open: parseFloat(item.open),
        high: parseFloat(item.high),
        low: parseFloat(item.low),
        close: parseFloat(item.close),
      }));
      
      initializeChart(processedData);
    } catch (error) {
      console.error('Error fetching data:', error);
      let errorMessage = 'An error occurred while fetching data.';
      
      if (error.response) {
        if (error.response.status === 404) {
          errorMessage = `Ticker symbol "${ticker}" was not found. Please check the symbol and try again.`;
        } else if (error.response.data && error.response.data.error) {
          errorMessage = error.response.data.error;
        }
      }
      
      setError({
        title: 'Data Error',
        message: errorMessage
      });
      setLoading(false);
    }
  };
  
  // Initialize and set up chart
  const initializeChart = (data) => {
    if (!chartContainer.current) {
      console.error('Chart container not available');
      setLoading(false);
      return;
    }
    
    // Clean up existing chart if it exists
    if (chartRef.current) {
      chartRef.current.remove();
    }
    
    // Create chart
    chartRef.current = createChart(chartContainer.current, {
      height: chartContainer.current.clientHeight,
      width: chartContainer.current.clientWidth,
      layout: {
        background: { color: '#0e1621' },
        textColor: '#9ca3af',
        fontFamily: "'Roboto', sans-serif",
      },
      grid: {
        vertLines: { color: '#1a2130' },
        horzLines: { color: '#1a2130' },
      },
      timeScale: {
        borderColor: '#2a3245',
        timeVisible: true,
        secondsVisible: false,
      },
      crosshair: {
        mode: 1,
        vertLine: {
          width: 1,
          color: '#536680',
          style: 0,
        },
        horzLine: {
          width: 1,
          color: '#536680',
          style: 0,
        },
      },
      watermark: {
        visible: false,
      },
    });
    
    // Create candlestick series
    candleSeriesRef.current = chartRef.current.addCandlestickSeries({
      upColor: '#26a69a',
      downColor: '#ef5350',
      borderVisible: false,
      wickUpColor: '#26a69a',
      wickDownColor: '#ef5350',
    });
    
    // Add price data to candlestick series
    candleSeriesRef.current.setData(data);
    
    // Set initial time range to last 90 days
    setInitialTimeRange(data);
    
    setLoading(false);
  };
  
  // Set initial time range to last 90 days
  const setInitialTimeRange = (data) => {
    if (!chartRef.current || !data || data.length === 0) return;
    
    try {
      // If we have enough data, show the last 90 days
      if (data.length > 90) {
        const visibleRange = {
          from: data[data.length - 90].time,
          to: data[data.length - 1].time,
        };
        
        chartRef.current.timeScale().setVisibleRange(visibleRange);
      } else {
        // Otherwise show all data
        chartRef.current.timeScale().fitContent();
      }
    } catch (error) {
      console.error('Error setting time range:', error);
      // Fall back to showing all data
      chartRef.current.timeScale().fitContent();
    }
  };
  
  // Toggle option chain display
  const toggleOptionChain = () => {
    setShowOptionChain(!showOptionChain);
    
    // Schedule a resize after state update
    setTimeout(() => {
      if (chartRef.current && chartContainer.current) {
        chartRef.current.resize(
          chartContainer.current.clientWidth,
          chartContainer.current.clientHeight
        );
      }
    }, 100);
  };
  
  // Handle chart resizing
  useEffect(() => {
    const handleResize = () => {
      if (chartRef.current && chartContainer.current) {
        chartRef.current.resize(
          chartContainer.current.clientWidth,
          chartContainer.current.clientHeight
        );
      }
    };
    
    window.addEventListener('resize', handleResize);
    
    return () => {
      window.removeEventListener('resize', handleResize);
    };
  }, []);
  
  // Resize function for when options are shown/hidden
  useEffect(() => {
    if (chartRef.current && chartContainer.current) {
      // Store full dimensions when options are hidden
      if (!showOptionChain) {
        chartDimensions.current = {
          width: chartContainer.current.clientWidth,
          height: chartContainer.current.clientHeight
        };
      }
      
      // Always resize to ensure the chart fits properly
      setTimeout(() => {
        // Add slight delay to ensure DOM updates first
        chartRef.current.resize(
          chartContainer.current.clientWidth,
          chartContainer.current.clientHeight
        );
      }, 50);
    }
  }, [showOptionChain]);
  
  const retryFetch = () => {
    setLoading(true);
    setError(null);
    fetchData();
  };
  
  return (
    <ChartContainer>
      <ChartHeader>
        <PriceInfo>
          <TickerSymbol>{ticker}</TickerSymbol>
          <PriceDisplay>
            <PriceValue>${priceInfo.price.toFixed(2)}</PriceValue>
            <PriceChange isPositive={priceInfo.change >= 0}>
              {priceInfo.change >= 0 ? '+' : ''}{priceInfo.change.toFixed(2)} ({priceInfo.percentChange.toFixed(2)}%)
            </PriceChange>
          </PriceDisplay>
        </PriceInfo>
        <ToggleButton onClick={() => setShowOptionChain(!showOptionChain)}>
          {showOptionChain ? 'Hide Options' : 'Show Options'}
        </ToggleButton>
      </ChartHeader>
      
      <ChartWrapper style={{ height: showOptionChain ? 'calc(100% - 300px)' : '100%' }}>
        <div ref={chartContainer} style={{ width: '100%', height: '100%' }}></div>
        
        {/* Loading overlay */}
        {loading && (
          <LoadingOverlay>
            <LoadingSpinner />
            <LoadingText>Loading chart data...</LoadingText>
          </LoadingOverlay>
        )}
        
        {/* Error overlay */}
        {error && !loading && (
          <ErrorOverlay>
            <ErrorIcon>⚠️</ErrorIcon>
            <ErrorTitle>{error.title}</ErrorTitle>
            <ErrorMessage>{error.message}</ErrorMessage>
            <StyledButton onClick={retryFetch}>Retry</StyledButton>
          </ErrorOverlay>
        )}
        
        {/* Options overlay */}
        {showOptionChain && (
          <OptionChainOverlay>
            <OptionChainHeader>
              <h3>Options Chain for {ticker}</h3>
            </OptionChainHeader>
            <OptionChainContent>
              <OptionChain ticker={ticker} currentPrice={priceInfo.price} />
            </OptionChainContent>
          </OptionChainOverlay>
        )}
      </ChartWrapper>
    </ChartContainer>
  );
};

export default StockChart;