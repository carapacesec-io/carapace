import { logger } from "@carapace/engine";

/**
 * Fetches secrets from AWS Secrets Manager and injects them into process.env.
 * Called once at worker startup — key lives in memory only, never on disk.
 */
export async function loadSecrets(): Promise<void> {
  const secretName = process.env.AWS_SECRET_NAME || "carapace/api-keys";
  const region = process.env.AWS_REGION || "us-east-1";

  try {
    // Use AWS SDK v3 (available on EC2 via instance profile or env creds)
    const { SecretsManagerClient, GetSecretValueCommand } = await import(
      "@aws-sdk/client-secrets-manager"
    );

    const client = new SecretsManagerClient({ region });
    const response = await client.send(
      new GetSecretValueCommand({ SecretId: secretName })
    );

    if (response.SecretString) {
      const secrets = JSON.parse(response.SecretString);
      for (const [key, value] of Object.entries(secrets)) {
        if (typeof value === "string" && !process.env[key]) {
          process.env[key] = value;
        }
      }
      logger.info("[secrets] Loaded API keys from Secrets Manager");
    }
  } catch (err: any) {
    // Not fatal — static-only mode still works without API key
    logger.warn(
      "[secrets] Could not load from Secrets Manager:",
      err.message,
    );
    logger.warn("[secrets] Worker will run in static-only mode");
  }
}
