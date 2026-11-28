import AccountWorkspace from '../features/accounts/AccountWorkspace'

/**
 * The account pages on a phone: the same workspace tabs, full screen.
 * Its vault, profile, reports and messages already read the same stores.
 */
export default function MobileAccount() {
  return (
    <div className="mob-account">
      <AccountWorkspace />
    </div>
  )
}
