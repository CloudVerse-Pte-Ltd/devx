import { Command } from 'commander';
import { getConfig, saveConfig, clearConfig, isAuthenticated, getMaskedToken } from '../config/store';
import { startDeviceAuth, pollDeviceAuth, ApiError } from '../api/client';
import open from 'open';

const POLL_INTERVAL_MS = 5000;

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function login(): Promise<void> {
  console.log('');
  console.log('CloudVerse DevX CLI — Device Login');
  console.log('');

  try {
    const deviceAuth = await startDeviceAuth();

    console.log('1) Open this URL in your browser:');
    console.log(`   ${deviceAuth.verificationUrl}`);
    console.log('');

    // Attempt to open the browser automatically
    try {
      await open(deviceAuth.verificationUrl);
    } catch (err) {
      // Ignore errors if browser can't be opened (e.g. headless environment)
    }

    console.log('2) Enter this code:');
    console.log(`   ${deviceAuth.userCode}`);
    console.log('');
    console.log('This code expires in 10 minutes.');
    console.log('');

    const expiresAt = Date.now() + deviceAuth.expiresIn * 1000;
    const interval = (deviceAuth.pollInterval || 5) * 1000;

    while (Date.now() < expiresAt) {
      await sleep(interval);

      try {
        const result = await pollDeviceAuth(deviceAuth.deviceCode);

        if (result.status === 'approved' && result.accessToken) {
          const config = getConfig();
          config.accessToken = result.accessToken;
          config.userId = result.userId!;
          config.orgId = result.orgId!;
          config.orgName = result.orgName;
          saveConfig(config);

          const displayName = result.orgName || result.orgId;
          console.log('Authenticated. Organization: ' + displayName + '. Device linked.');
          console.log('');
          return;
        }

        if (result.status === 'expired') {
          console.error('');
          console.error('Authentication request expired. Please try again.');
          process.exit(3);
        }

        if (result.status === 'denied') {
          console.error('');
          console.error('Authentication was denied.');
          process.exit(3);
        }

      } catch (e) {
        if (e instanceof ApiError) {
          if (e.code === 'authorization_pending') {
            continue;
          }
          if (e.code === 'slow_down') {
            await sleep(5000);
            continue;
          }
          if (e.code === 'expired_token') {
            console.error('');
            console.error('Authentication request expired. Please try again.');
            process.exit(3);
          }
          if (e.code === 'access_denied') {
            console.error('');
            console.error('Authentication was denied.');
            process.exit(3);
          }
        }
        throw e;
      }
    }

    console.error('');
    console.error('Authentication timed out. Please try again.');
    process.exit(3);

  } catch (e) {
    if (e instanceof ApiError) {
      console.error(`Authentication error: ${e.message}`);
    } else if (e instanceof Error) {
      console.error(`Error: ${e.message}`);
    }
    process.exit(3);
  }
}

function status(): void {
  const config = getConfig();
  const authenticated = isAuthenticated();

  console.log('');
  console.log('DevX CLI Status');
  console.log('');
  console.log(`  API URL: ${config.apiBaseUrl}`);
  console.log(`  Authenticated: ${authenticated ? 'Yes' : 'No'}`);

  if (authenticated) {
    console.log(`  Organization: ${config.orgId}`);
    console.log(`  User: ${config.userId}`);
    console.log(`  Token: ${getMaskedToken(config.accessToken)}`);
  }

  console.log(`  Machine ID: ${config.machineId}`);
  console.log(`  Default Branch: ${config.defaultBranch}`);
  console.log('');
}

function logout(): void {
  clearConfig();
  console.log('');
  console.log('Logged out successfully.');
  console.log('');
}

export function createAuthCommand(): Command {
  const auth = new Command('auth')
    .description('Manage DevX authentication');

  auth
    .command('login')
    .description('Authenticate with DevX using device flow')
    .action(login);

  auth
    .command('status')
    .description('Show current authentication status')
    .action(status);

  auth
    .command('logout')
    .description('Remove local credentials')
    .action(logout);

  return auth;
}
