-- ==============================================================================
-- Migration: 20261124160000_corporate_actions_and_dividend_durability.sql
-- Description: Enforces reverse-split fractional checks, canonical corporate action enums,
--              gross/net DPS column separation, and re-scopes legacy dividend transfer tags.
-- ==============================================================================

-- 1. Ensure corporate_actions table exists
CREATE TABLE IF NOT EXISTS public.corporate_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_id UUID REFERENCES public.assets(id) ON DELETE CASCADE,
    symbol VARCHAR(32) NOT NULL,
    action_type VARCHAR(32) NOT NULL,
    split_ratio NUMERIC NOT NULL CHECK (split_ratio > 0),
    record_date DATE NOT NULL,
    effective_date DATE NOT NULL,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT corporate_actions_symbol_date_key UNIQUE (symbol, effective_date, action_type)
);

-- Ensure action_type check constraint accepts canonical action types
ALTER TABLE public.corporate_actions 
DROP CONSTRAINT IF EXISTS corporate_actions_action_type_check;

ALTER TABLE public.corporate_actions 
ADD CONSTRAINT corporate_actions_action_type_check 
CHECK (action_type IN ('FORWARD_SPLIT', 'REVERSE_SPLIT', 'STOCK_SPLIT', 'BONUS_ISSUE', 'RIGHTS_OFFERING', 'TICKER_CHANGE'));

-- Ensure reverse_split ratio is strictly fractional (< 1.0)
ALTER TABLE public.corporate_actions 
DROP CONSTRAINT IF EXISTS corporate_actions_reverse_split_ratio_check;

ALTER TABLE public.corporate_actions 
ADD CONSTRAINT corporate_actions_reverse_split_ratio_check 
CHECK (action_type != 'REVERSE_SPLIT' OR split_ratio < 1.0);

CREATE INDEX IF NOT EXISTS corporate_actions_symbol_date_idx 
ON public.corporate_actions (symbol, effective_date);

-- 2. Ensure asset_dividends has explicit gross_amount and net_amount columns
ALTER TABLE public.asset_dividends 
ADD COLUMN IF NOT EXISTS gross_amount NUMERIC;

ALTER TABLE public.asset_dividends 
ADD COLUMN IF NOT EXISTS net_amount NUMERIC;

-- 3. Legacy Dividend Tag One-Time Migration:
-- Re-scopes legacy [DIVIDEND:<symbol>:<ex_date>] transfer tags to
-- [DIVIDEND:<portfolio_id>:<symbol>:<ex_date>] based on user's portfolio holding
DO $$
DECLARE
    r RECORD;
    v_portfolio_id UUID;
    v_clean_sym VARCHAR;
    v_ex_date VARCHAR;
    v_new_tag VARCHAR;
BEGIN
    FOR r IN 
        SELECT id, user_id, notes
        FROM public.portfolio_transfers
        WHERE transfer_type = 'DIVIDEND'
          AND notes ~ '\[DIVIDEND:([A-Za-z0-9._]+):([0-9-]+)\]'
          AND NOT notes ~ '\[DIVIDEND:[A-Za-z0-9._-]+:[A-Za-z0-9._]+:[0-9-]+\]'
    LOOP
        v_clean_sym := (regexp_match(r.notes, '\[DIVIDEND:([A-Za-z0-9._]+):([0-9-]+)\]'))[1];
        v_ex_date := (regexp_match(r.notes, '\[DIVIDEND:([A-Za-z0-9._]+):([0-9-]+)\]'))[2];
        
        -- Resolve the user's active or latest portfolio_id for this asset from portfolio_positions
        SELECT pos.portfolio_id INTO v_portfolio_id
        FROM public.portfolio_positions pos
        JOIN public.assets a ON a.id = pos.asset_id
        WHERE pos.user_id = r.user_id
          AND (a.symbol = v_clean_sym OR a.symbol = v_clean_sym || '.IS')
        ORDER BY pos.is_open DESC, pos.updated_at DESC
        LIMIT 1;

        IF v_portfolio_id IS NOT NULL THEN
            v_new_tag := '[DIVIDEND:' || v_portfolio_id::text || ':' || v_clean_sym || ':' || v_ex_date || ']';
            
            UPDATE public.portfolio_transfers
            SET portfolio_id = v_portfolio_id,
                notes = regexp_replace(notes, '\[DIVIDEND:([A-Za-z0-9._]+):([0-9-]+)\]', v_new_tag)
            WHERE id = r.id;
        ELSE
            v_new_tag := '[DIVIDEND:default:' || v_clean_sym || ':' || v_ex_date || ']';
            
            UPDATE public.portfolio_transfers
            SET notes = regexp_replace(notes, '\[DIVIDEND:([A-Za-z0-9._]+):([0-9-]+)\]', v_new_tag)
            WHERE id = r.id;
        END IF;
    END LOOP;
END $$;
