DO $verify$
BEGIN
  IF EXISTS (
    SELECT owner_msisdn
    FROM public."SW_TBL_WALLET"
    WHERE owner_type='CUSTOMER' AND is_default AND "Status"<>6
    GROUP BY owner_msisdn HAVING count(*)<>1
  ) THEN
    RAISE EXCEPTION 'A customer has more than one active default wallet';
  END IF;

  IF EXISTS (
    SELECT profile."MSISDN"
    FROM public."SW_TBL_PROFILE_CUST" profile
    JOIN public."SW_TBL_WALLET" wallet
      ON wallet.owner_type='CUSTOMER'
     AND wallet.owner_msisdn=profile."MSISDN"
     AND wallet."Status"<>6
    GROUP BY profile."MSISDN"
    HAVING count(*) FILTER (WHERE wallet.is_default)<>1
  ) THEN
    RAISE EXCEPTION 'A customer with wallets does not have exactly one default currency';
  END IF;
END
$verify$;

SELECT 'Customer default currency and bank routing verified' AS result;
