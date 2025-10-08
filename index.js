const express = require("express");
const cors = require("cors");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");

const app = express();
const port = 5000;

app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://vape-premium:UCtwQD92vgfMwwbV@cluster0.uue8s59.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0`;
const client = new MongoClient(uri, {
  serverApi: ServerApiVersion.v1,
});

async function run() {
  try {
    const productsCollection = client.db("Vape").collection("products");
    const orderCollection = client.db("Vape").collection("orderdata");

    // all product
    app.get("/products", async (req, res) => {
      const result = await productsCollection.find({}).toArray();
      res.send(result);
    });
    // all type product
    app.get("/products/:category/:brand", async (req, res) => {
      try {
        const { category, brand } = req.params;

        const categoryDoc = await productsCollection.findOne({
          slug: category,
        });

        if (!categoryDoc) {
          return res
            .status(404)
            .send({ message: `Category '${category}' not found` });
        }

        const brandData = categoryDoc.brands.find(
          (b) => b.name.toLowerCase() === brand.toLowerCase()
        );

        if (!brandData) {
          return res.status(404).send({
            message: `Brand '${brand}' not found in category '${category}'`,
          });
        }

        res.send(brandData.types);

        console.log(brandData.types);
      } catch (error) {
        console.error("Error fetching brand types:", error);
        res.status(500).send({ message: "Internal server error" });
      }
    });
    // type slug
    app.get("/products/:category/:brand/:slug", async (req, res) => {
      try {
        const { category, brand, slug } = req.params;

        const categoryDoc = await productsCollection.findOne({
          slug: category,
        });

        if (!categoryDoc) {
          return res
            .status(404)
            .send({ message: `Category '${category}' not found` });
        }

        const brandData = categoryDoc.brands.find(
          (b) => b.name.toLowerCase() === brand.toLowerCase()
        );

        if (!brandData) {
          return res.status(404).send({
            message: `Brand '${brand}' not found in category '${category}'`,
          });
        }

        const typeData = brandData.types.find(
          (b) => b.slug.toLowerCase() === slug.toLowerCase()
        );
        res.send(typeData);
        console.log(typeData);
      } catch (error) {
        console.error("Error fetching brand types:", error);
        res.status(500).send({ message: "Internal server error" });
      }
    });

    // make order
    app.post("/order", async (req, res) => {
      const data = req.body;
      if (!data) {
        return res.status(400).send({ error: "Payload is missing or invalid" });
      }
      const result = await orderCollection.insertOne(data);
      res.send(result);
    });
    // see order in admin panel
    app.get("/orderData", async (req, res) => {
      const result = await orderCollection.find({}).toArray();
      res.send(result);
    });
  } finally {
  }
}

run().catch(console.log);

app.get("/", async (req, res) => {
  res.send("Vape server is running");
});

app.listen(port, () => console.log(`Vape server is running on port ${port}`));
