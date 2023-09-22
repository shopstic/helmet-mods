import { z } from "../../src/deps/zod.ts";
import { ClientResponse, OpenapiClient } from "../../src/libs/openapi/openapi_client.ts";
import { endpoints, UserSchema } from "./test_endpoints.ts";

const testClient = new OpenapiClient({
  baseUrl: "http://localhost:9876",
  endpoints,
});

const user: z.infer<typeof UserSchema> = {
  id: 123,
  age: 50,
  name: "Jacky",
  gender: "male",
  weapon: {
    type: "a",
    a: "foo bar",
  },
};

async function testFetch<R extends ClientResponse>(name: string, doIt: () => Promise<R>) {
  console.log(`${name} -----------------------`);
  try {
    const response = await doIt();

    console.log(
      response.headers,
      response.status,
      response.data,
    );
  } catch (e) {
    console.error("Failed", e, JSON.stringify(e, null, 2));
  }
}

await testFetch("GET /healthz", () => testClient.get("/healthz", {}));
await testFetch("GET /alivez", async () => {
  const response = await testClient.get("/alivez", {});

  console.log("OK", response.data === "OK");

  console.log("X-RateLimit-Limit", response.headers["X-RateLimit-Limit"]);

  return response;
});

await testFetch("PUT /users/{id}", async () => {
  const response = await testClient.put("/users/{id}", {
    params: {
      id: 99,
    },
    query: {
      dryRun: true,
    },
    body: user,
    headers: {
      "x-some-uuid": "b473dbfe-2a89-4b8f-8d7a-3c576a917c14",
      "x-some-date": new Date(),
    },
  });

  response.data.age;
  response.data.name;

  return response;
});

await testFetch("GET /users/{id}", () =>
  testClient.get("/users/{id}", {
    params: {
      id: 99999,
    },
  }));

await testFetch("POST /users/{id}", async () => {
  const response = await testClient.post("/users/{id}", {
    params: {
      id: 999,
    },
    query: {
      dryRun: true,
    },
    body: user,
    headers: {
      "x-some-uuid": "8443e041-ba6c-442c-81fa-bd0345c970c5",
      "x-some-date": new Date(),
    },
  });

  if (response.status === 200) {
    response.data.age;
  } else if (response.status === 201) {
    response.data.gender;
  } else if (response.status === 404) {
    response.data.message;
  }

  return response;
});

await testFetch("GET /download/{fileName}", async () => {
  const response = await testClient.get("/download/{fileName}.pdf", {
    params: {
      fileName: "foobar",
    },
  });

  console.log("binary length", (await response.response.arrayBuffer()).byteLength);

  return response;
});
