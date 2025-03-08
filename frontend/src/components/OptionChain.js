import React, { useState, useEffect } from 'react';
import axios from 'axios';
import styled from 'styled-components';

const OptionChainContainer = styled.div`
  background-color: var(--secondary-bg);
  padding: 15px;
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow-y: auto;
`;

const ExpirySelector = styled.div`
  display: flex;
  gap: 10px;
  margin-bottom: 15px;
  flex-wrap: wrap;
`;

const ExpiryButton = styled.button`
  background-color: ${props => props.active ? 'var(--accent-color)' : '#333'};
  color: var(--text-primary);
  border: none;
  padding: 8px 15px;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.2s;
  
  &:hover {
    background-color: ${props => props.active ? 'var(--accent-color)' : '#444'};
  }
`;

const TabSelector = styled.div`
  display: flex;
  margin-bottom: 15px;
`;

const TabButton = styled.button`
  background-color: ${props => props.active ? 'var(--secondary-bg)' : '#333'};
  color: var(--text-primary);
  border: 1px solid #444;
  border-bottom: ${props => props.active ? '1px solid var(--accent-color)' : '1px solid #444'};
  padding: 8px 15px;
  cursor: pointer;
  flex: 1;
  
  &:first-child {
    border-radius: 4px 0 0 0;
  }
  
  &:last-child {
    border-radius: 0 4px 0 0;
  }
  
  &:hover {
    background-color: ${props => props.active ? 'var(--secondary-bg)' : '#444'};
  }
`;

const OptionTable = styled.table`
  width: 100%;
  border-collapse: collapse;
  font-size: 14px;
`;

const TableHead = styled.thead`
  background-color: #333;
  position: sticky;
  top: 0;
`;

const TableRow = styled.tr`
  &:nth-child(even) {
    background-color: rgba(255, 255, 255, 0.05);
  }
  
  &:hover {
    background-color: rgba(255, 255, 255, 0.1);
  }
`;

const TableHeader = styled.th`
  padding: 10px;
  text-align: right;
  border-bottom: 1px solid #444;
  
  &:first-child {
    text-align: center;
  }
`;

const TableCell = styled.td`
  padding: 8px 10px;
  text-align: right;
  color: ${props => props.highlight ? (props.value >= 0 ? 'var(--accent-color)' : 'var(--error-color)') : 'inherit'};
  font-weight: ${props => props.bold ? 'bold' : 'normal'};
`;

const InTheMoney = styled.span`
  color: var(--accent-color);
  font-size: 10px;
  margin-left: 4px;
`;

const InfoRow = styled.div`
  display: flex;
  margin-bottom: 15px;
  gap: 20px;
  flex-wrap: wrap;
`;

const InfoItem = styled.div`
  display: flex;
  flex-direction: column;
`;

const InfoLabel = styled.span`
  font-size: 12px;
  color: var(--text-secondary);
`;

const InfoValue = styled.span`
  font-size: 14px;
  font-weight: bold;
`;

const LoadingMessage = styled.div`
  display: flex;
  justify-content: center;
  align-items: center;
  height: 150px;
  color: var(--text-secondary);
`;

const ErrorMessage = styled.div`
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  height: 150px;
  color: var(--error-color);
  
  button {
    margin-top: 15px;
    background-color: #333;
    color: var(--text-primary);
    border: none;
    padding: 8px 15px;
    border-radius: 4px;
    cursor: pointer;
  }
`;

const DatePickerContainer = styled.div`
  display: flex;
  align-items: center;
  margin-bottom: 15px;
  gap: 10px;
`;

const DateInput = styled.input`
  background-color: #333;
  color: var(--text-primary);
  border: 1px solid #444;
  border-radius: 4px;
  padding: 8px 12px;
  font-size: 14px;
  
  &::-webkit-calendar-picker-indicator {
    filter: invert(1);
  }
`;

const DateButton = styled.button`
  background-color: var(--accent-color);
  color: var(--text-primary);
  border: none;
  padding: 8px 15px;
  border-radius: 4px;
  cursor: pointer;
  transition: background-color 0.2s;
  
  &:hover {
    background-color: #3a8c3a;
  }
`;

const OptionChain = ({ ticker }) => {
  const [optionData, setOptionData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedExpiry, setSelectedExpiry] = useState(null);
  const [activeTab, setActiveTab] = useState('calls');
  const [customDate, setCustomDate] = useState('');
  
  // Calculate min date (today) and max date (1 year from now)
  const today = new Date();
  const minDate = today.toISOString().split('T')[0];
  const maxDate = new Date(today.setFullYear(today.getFullYear() + 1)).toISOString().split('T')[0];

  const fetchOptionData = async (date = null) => {
    setLoading(true);
    setError('');
    
    try {
      // Build URL with optional date parameter
      let url = `/api/options/${ticker}`;
      if (date) {
        url += `?date=${date}`;
      }
      
      console.log(`Fetching options data for ${ticker} from URL: ${url}`);
      
      // Use relative URL path to avoid CORS issues
      const response = await axios.get(url);
      console.log("Options API raw response:", response);
      console.log("Option data response:", response.data);
      
      if (response.data && response.data.error) {
        console.error("API returned an error:", response.data.error);
        throw new Error(response.data.error);
      }
      
      if (!response.data || !response.data.optionChain) {
        console.error("Invalid or empty options data structure:", response.data);
        throw new Error("Invalid options data received from server");
      }
      
      setOptionData(response.data);
      
      // Set the first expiry as default or the custom date if provided
      if (response.data && response.data.optionChain) {
        // Sort expiry dates to ensure proper order
        const expiryDates = Object.keys(response.data.optionChain).sort((a, b) => parseInt(a) - parseInt(b));
        console.log("Available expiry dates:", expiryDates);
        setSelectedExpiry(expiryDates[0]);
      }
    } catch (err) {
      console.error('Error fetching option data:', err);
      console.error('Error details:', err.response || err.message);
      setError(err.message || 'Failed to load option data');
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    if (ticker) {
      fetchOptionData();
    }
  }, [ticker]);

  const handleRetry = () => {
    fetchOptionData();
  };
  
  const handleDateChange = (e) => {
    setCustomDate(e.target.value);
  };
  
  const handleDateSubmit = () => {
    if (customDate) {
      fetchOptionData(customDate);
    }
  };

  if (loading) {
    return (
      <OptionChainContainer>
        <LoadingMessage>Loading option chain data...</LoadingMessage>
      </OptionChainContainer>
    );
  }

  if (error) {
    return (
      <OptionChainContainer>
        <ErrorMessage>
          <div>{error}</div>
          <button onClick={handleRetry}>Retry</button>
        </ErrorMessage>
      </OptionChainContainer>
    );
  }

  if (!optionData || !selectedExpiry) {
    return (
      <OptionChainContainer>
        <LoadingMessage>No option data available</LoadingMessage>
      </OptionChainContainer>
    );
  }

  const { price, volatility, optionChain, customDate: serverCustomDate } = optionData;
  const expiryDates = Object.keys(optionChain).sort((a, b) => parseInt(a) - parseInt(b));
  const selectedOptions = optionChain[selectedExpiry];
  
  // Format the expiry date for display
  const formatExpiryDate = (days) => {
    if (days === '0') {
      return 'Today (0d)';
    }
    
    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + parseInt(days));
    const month = expiryDate.toLocaleString('default', { month: 'short' });
    const day = expiryDate.getDate();
    
    // If this is a custom date that replaced the 0 DTE, show special formatting
    if (days === expiryDates[0] && serverCustomDate) {
      const customDateObj = new Date(serverCustomDate);
      const customMonth = customDateObj.toLocaleString('default', { month: 'short' });
      const customDay = customDateObj.getDate();
      return `${customMonth} ${customDay} (${days}d)`;
    }
    
    return `${month} ${day} (${days}d)`;
  };

  return (
    <OptionChainContainer>
      <InfoRow>
        <InfoItem>
          <InfoLabel>Stock Price</InfoLabel>
          <InfoValue>${price.toFixed(2)}</InfoValue>
        </InfoItem>
        <InfoItem>
          <InfoLabel>Historical Volatility</InfoLabel>
          <InfoValue>{(volatility * 100).toFixed(2)}%</InfoValue>
        </InfoItem>
        <InfoItem>
          <InfoLabel>Selected Expiry</InfoLabel>
          <InfoValue>{formatExpiryDate(selectedExpiry)}</InfoValue>
        </InfoItem>
      </InfoRow>
      
      <DatePickerContainer>
        <InfoLabel>Custom Expiry Date:</InfoLabel>
        <DateInput 
          type="date" 
          value={customDate} 
          onChange={handleDateChange} 
          min={minDate}
          max={maxDate}
        />
        <DateButton onClick={handleDateSubmit}>Calculate</DateButton>
      </DatePickerContainer>
      
      <ExpirySelector>
        {expiryDates.map(expiry => (
          <ExpiryButton
            key={expiry}
            active={selectedExpiry === expiry}
            onClick={() => setSelectedExpiry(expiry)}
          >
            {formatExpiryDate(expiry)}
          </ExpiryButton>
        ))}
      </ExpirySelector>
      
      <TabSelector>
        <TabButton
          active={activeTab === 'calls'}
          onClick={() => setActiveTab('calls')}
        >
          Calls
        </TabButton>
        <TabButton
          active={activeTab === 'puts'}
          onClick={() => setActiveTab('puts')}
        >
          Puts
        </TabButton>
      </TabSelector>
      
      <OptionTable>
        <TableHead>
          <tr>
            <TableHeader>Strike</TableHeader>
            <TableHeader>Price</TableHeader>
            <TableHeader>Delta</TableHeader>
            <TableHeader>Gamma</TableHeader>
            <TableHeader>Theta</TableHeader>
            <TableHeader>Vega</TableHeader>
          </tr>
        </TableHead>
        <tbody>
          {selectedOptions[activeTab].map((option, index) => (
            <TableRow key={index}>
              <TableCell bold>
                {option.strike.toFixed(2)}
                {option.inTheMoney && <InTheMoney>ITM</InTheMoney>}
              </TableCell>
              <TableCell bold>{option.price.toFixed(2)}</TableCell>
              <TableCell highlight value={option.delta}>{option.delta.toFixed(3)}</TableCell>
              <TableCell>{option.gamma.toFixed(4)}</TableCell>
              <TableCell highlight value={-option.theta}>{option.theta.toFixed(4)}</TableCell>
              <TableCell>{option.vega.toFixed(4)}</TableCell>
            </TableRow>
          ))}
        </tbody>
      </OptionTable>
    </OptionChainContainer>
  );
};

export default OptionChain; 