// Import Vercel Analytics
import { inject } from '@vercel/analytics';

// Initialize Vercel Analytics
inject({
  mode: 'production',
  debug: false
});

// Import existing app scripts
// Note: These are loaded directly in HTML to preserve their current functionality
// The analytics is the only module-based import
