export interface Account {
  account_id: string;
  iban: string;
  customer_id: string;
}

export interface Transaction {
  tx_id: string;
  account_id: string;
  booking_ts: string;
  amount_eur: number;
  type: string;
}

export interface TransferResult {
  status: string;
  debit_tx: string;
  credit_tx: string;
  timestamp: string;
}

export interface HealthResult {
  status: string;
}

export interface LoginResult {
  access_token: string;
  token_type: string;
}
