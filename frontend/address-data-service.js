/**
 * AddressDataService
 * 
 * Service for loading and querying Nigerian state, LGA, and ward/area data
 * from the static state-lga-area.json file.
 * 
 * This service provides cascading dropdown functionality for address entry:
 * - State → LGA → Area/Ward
 * 
 * Data is loaded once and cached in memory for instant filtering.
 * 
 * Requirements: 9.1
 */
class AddressDataService {
  constructor() {
    this.data = null;
    this.isLoaded = false;
  }

  /**
   * Load and parse the state-lga-area.json file
   * Caches the parsed data in memory for instant filtering
   * 
   * @returns {Promise<void>}
   * @throws {Error} If the JSON file fails to load or parse
   */
  async loadData() {
    try {
      const response = await fetch('state-lga-area.json');
      
      if (!response.ok) {
        throw new Error(`Failed to load address data: ${response.status} ${response.statusText}`);
      }
      
      this.data = await response.json();
      this.isLoaded = true;
      
      console.log('Address data loaded successfully:', {
        states: this.data.length,
        totalLGAs: this.data.reduce((sum, state) => sum + state.lgas.length, 0)
      });
    } catch (error) {
      console.error('Error loading address data:', error);
      throw new Error('Unable to load address data. Please refresh the page and try again.');
    }
  }

  /**
   * Get array of all state names
   * 
   * @returns {string[]} Array of state names (lowercase)
   * @throws {Error} If data has not been loaded
   */
  getStates() {
    if (!this.isLoaded || !this.data) {
      throw new Error('Address data not loaded. Call loadData() first.');
    }
    
    return this.data.map(item => item.state);
  }

  /**
   * Get array of LGAs for a specified state
   * 
   * @param {string} state - State name (case-insensitive)
   * @returns {string[]} Array of LGA names for the specified state
   * @throws {Error} If data has not been loaded
   */
  getLGAsForState(state) {
    if (!this.isLoaded || !this.data) {
      throw new Error('Address data not loaded. Call loadData() first.');
    }
    
    if (!state) {
      return [];
    }
    
    // Normalize state name to lowercase for case-insensitive matching
    const normalizedState = state.toLowerCase().trim();
    
    const stateData = this.data.find(item => item.state === normalizedState);
    
    if (!stateData) {
      console.warn(`State not found: ${state}`);
      return [];
    }
    
    return stateData.lgas.map(lga => lga.lga);
  }

  /**
   * Get array of wards/areas for a specified state and LGA
   * 
   * Note: JSON uses "wards" field (equivalent to "area")
   * 
   * @param {string} state - State name (case-insensitive)
   * @param {string} lga - LGA name (case-insensitive)
   * @returns {string[]} Array of ward/area names for the specified LGA
   * @throws {Error} If data has not been loaded
   */
  getWardsForLGA(state, lga) {
    if (!this.isLoaded || !this.data) {
      throw new Error('Address data not loaded. Call loadData() first.');
    }
    
    if (!state || !lga) {
      return [];
    }
    
    // Normalize inputs to lowercase for case-insensitive matching
    const normalizedState = state.toLowerCase().trim();
    const normalizedLGA = lga.toLowerCase().trim();
    
    const stateData = this.data.find(item => item.state === normalizedState);
    
    if (!stateData) {
      console.warn(`State not found: ${state}`);
      return [];
    }
    
    const lgaData = stateData.lgas.find(item => item.lga === normalizedLGA);
    
    if (!lgaData) {
      console.warn(`LGA not found: ${lga} in state ${state}`);
      return [];
    }
    
    return lgaData.wards || [];
  }

  /**
   * Check if data has been loaded
   * 
   * @returns {boolean} True if data is loaded, false otherwise
   */
  isDataLoaded() {
    return this.isLoaded;
  }

  /**
   * Get statistics about the loaded data
   * Useful for debugging and verification
   * 
   * @returns {Object} Statistics object with state count, LGA count, etc.
   * @throws {Error} If data has not been loaded
   */
  getDataStats() {
    if (!this.isLoaded || !this.data) {
      throw new Error('Address data not loaded. Call loadData() first.');
    }
    
    const totalLGAs = this.data.reduce((sum, state) => sum + state.lgas.length, 0);
    const totalWards = this.data.reduce((sum, state) => {
      return sum + state.lgas.reduce((lgaSum, lga) => lgaSum + (lga.wards?.length || 0), 0);
    }, 0);
    
    return {
      states: this.data.length,
      lgas: totalLGAs,
      wards: totalWards
    };
  }
}

// Export for use in other modules (if using ES6 modules)
// export default AddressDataService;
