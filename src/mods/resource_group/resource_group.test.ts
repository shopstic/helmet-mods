import {
  createK8sConfigMap,
  createK8sDeployment,
  createK8sIngress,
  createK8sSecret,
  createK8sService,
  createK8sVolume,
} from "../../deps/k8s_utils.ts";
import { assertEquals } from "../../deps/std_testing.ts";
import { extractK8sResources } from "./resource_group.ts";

Deno.test("resource_group extractK8sResources", () => {
  const one = createK8sDeployment({
    metadata: {
      name: "one",
    },
  });

  const two = createK8sService({
    metadata: {
      name: "one",
    },
  });

  const three = createK8sConfigMap({
    metadata: {
      name: "three",
    },
  });

  const four = createK8sSecret({
    metadata: {
      name: "four",
    },
  });

  const five = createK8sVolume({
    name: "five",
  });

  const six = createK8sIngress({
    metadata: {
      name: "six",
    },
  });

  const resources = {
    one,
    two,
    three: [
      three,
      four,
      {
        five,
        six,
      },
    ],
  };

  assertEquals(extractK8sResources(resources), [
    one,
    two,
    three,
    four,
    six,
  ]);
});
