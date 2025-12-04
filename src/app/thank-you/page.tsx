import { Suspense } from "react";

import React from "react";
import ThankYou from "./ThankYou";

const page = () => {
  return (
    <Suspense>
      <ThankYou />
    </Suspense>
  );
};

export default page;
