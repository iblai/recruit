"use client";

import { useDispatch, useSelector } from "react-redux";
import { UpgradePackageModal } from "@iblai/iblai-js/web-containers";
import { setOpenPricingModal } from "@iblai/iblai-js/web-utils";
import config from "@/lib/iblai/config";
import { createOrganizationUrl, loginReturnUrl } from "@/lib/iblai/auth-redirect";
import { readUserEmail } from "@/lib/iblai/tenant";

type State = { subscription?: { openPricingModal?: boolean } };

/**
 * The SDK's "Upgrade for free" dialog — the $0 checkout that gives a user on
 * the community organization one of their own. Opened by a write on the
 * sample data and by the sample notice; mounted once in the platform layout.
 */
export function UpgradeModal({ org }: { org: string }) {
  const dispatch = useDispatch();
  const open = useSelector((state: State) => !!state.subscription?.openPricingModal);
  if (!open) return null;
  return (
    <UpgradePackageModal
      open
      onClose={() => dispatch(setOpenPricingModal(false))}
      redirectUrl={loginReturnUrl(config.checkoutReturnUrl())}
      checkoutUrl={createOrganizationUrl(config.checkoutReturnUrl(), readUserEmail())}
      sourcePlatformKey={org}
      mainPlatformKey={config.mainTenantKey()}
      currentUserEmail={readUserEmail()}
    />
  );
}
