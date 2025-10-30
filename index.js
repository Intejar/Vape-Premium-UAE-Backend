import express from "express";
import Fuse from "fuse.js";
import cors from "cors";
import { MongoClient, ServerApiVersion, ObjectId } from "mongodb";

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
      try {
        const { search, category } = req.query;

        // Step 1: Build MongoDB query for category (if provided)
        const mongoQuery = {};
        if (category && category.trim() !== "") {
          mongoQuery.category = { $regex: category.trim(), $options: "i" };
        }

        // Step 2: Get data from MongoDB
        const data = await productsCollection.find(mongoQuery).toArray();

        // Step 3: Flatten nested structure into single product list
        let products = [];
        data.forEach((cat) => {
          cat.brands?.forEach((brand) => {
            brand.types?.forEach((type) => {
              products.push({
                ...type,
                category: cat.category,
                brand: brand.name,
              });
            });
          });
        });

        // ✅ Step 4: If no queries, just return all products
        const hasSearch = search && search.trim() !== "";
        const hasCategory = category && category.trim() !== "";
        if (!hasSearch && !hasCategory) {
          return res.send(products);
        }

        // ✅ Step 5: Apply fuzzy search if search query is provided
        if (hasSearch) {
          const fuse = new Fuse(products, {
            keys: [
              "productName",
              "productShortDescription",
              "brand",
              "category",
            ],
            threshold: 0.4, // 0 (exact match) → 1 (very loose)
          });

          const results = fuse.search(search.trim());
          products = results.map((r) => r.item);
        }

        // ✅ Step 6: Return filtered or searched results
        res.send(products);
      } catch (error) {
        console.error("Error fetching products:", error);
        res.status(500).send({ error: "Failed to fetch products" });
      }
    });
    // all category
    app.get("/products/category", async (req, res) => {
      const data = await productsCollection.find({}).toArray();
      const categories = data.map((item) => item.category);
      res.send(categories);
    });
    // all category
    app.get("/category/:category", async (req, res) => {
      const data = await productsCollection.find({}).toArray();
      const { category } = req.params;
      const categoryDoc = await productsCollection.findOne({
        slug: category,
      });
      res.send(categoryDoc.brands);
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
          (b) => b.slug.toLowerCase() === brand.toLowerCase()
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

    app.get("/products/:slug", async (req, res) => {
      try {
        const { slug } = req.params;

        // Fetch all data from MongoDB
        const data = await productsCollection.find({}).toArray();

        let foundProduct = null;

        // Search deeply inside the nested structure
        for (const category of data) {
          for (const brand of category.brands) {
            for (const type of brand.types) {
              if (type.slug === slug) {
                foundProduct = type;
                break;
              }
            }
            if (foundProduct) break;
          }
          if (foundProduct) break;
        }

        if (foundProduct) {
          res.json(foundProduct);
        } else {
          res.status(404).json({ message: "Product not found" });
        }
      } catch (error) {
        console.error("Error fetching product:", error);
        res.status(500).json({ message: "Server error" });
      }
    });

    // update product data-
    app.patch("/products/:typeId", async (req, res) => {
      try {
        const { typeId } = req.params;
        const { soldOut, offerPrice } = req.body;

        // Build update object dynamically
        const updateFields = {};
        if (soldOut !== undefined)
          updateFields["brands.$[].types.$[t].soldOut"] = soldOut;
        if (offerPrice !== undefined)
          updateFields["brands.$[].types.$[t].offer.offerPrice"] = offerPrice;
        if (offerPrice !== undefined)
          updateFields["brands.$[].types.$[t].offer.isActive"] = true;

        const result = await productsCollection.updateOne(
          { "brands.types.id": parseInt(typeId) }, // ✅ Match inside nested array
          { $set: updateFields },
          { arrayFilters: [{ "t.id": parseInt(typeId) }] } // ✅ Target specific type
        );

        if (result.modifiedCount === 0) {
          return res.status(404).json({ message: "Product not found" });
        }

        res.json({ message: "Product updated successfully" });
      } catch (error) {
        console.error("Update error:", error);
        res.status(500).json({ error: "Failed to update product" });
      }
    });

    // make order
    app.post("/order", async (req, res) => {
      try {
        const data = req.body;

        if (!data || Object.keys(data).length === 0) {
          return res
            .status(400)
            .send({ error: "Payload is missing or invalid" });
        }

        // const result = await orderCollection.insertOne(data);
        // const adminNumber = "8801855561001"; // Admin number in international format
        // const text = encodeURIComponent(
        //   `📦 New Order Placed!\n\Please check your dashboard!
        //   `
        // );

        // const whatsappUrl = `https://wa.me/${adminNumber}?text=${text}`;

        res.status(201).send({
          message: "Order created successfully",
          orderId: result.insertedId,
        });
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: "Server error while creating order" });
      }
    });

    // see order in admin panel
    app.get("/orderData", async (req, res) => {
      try {
        const result = await orderCollection
          .find({})
          .sort({ _id: -1 }) // Sort by _id in descending order
          .toArray();

        res.send(result);
      } catch (error) {
        console.error(error);
        res.status(500).send({ error: "Server error while fetching orders" });
      }
    });

    app.patch("/order/:id", async (req, res) => {
      try {
        const { id } = req.params;
        const { status } = req.body;

        if (!status) {
          return res.status(400).json({ message: "Status field is required" });
        }

        if (!ObjectId.isValid(id)) {
          return res.status(400).json({ message: "Invalid order ID" });
        }

        const result = await orderCollection.updateOne(
          { _id: new ObjectId(id) },
          { $set: { status } }
        );

        if (result.matchedCount === 0) {
          return res.status(404).json({ message: "Order not found" });
        }

        res.json({ message: "Order status updated successfully" });
      } catch (error) {
        console.error("Error updating order status:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    });
    // track order
    app.get("/track/:orderId", async (req, res) => {
      try {
        const { orderId } = req.params;

        // Validate that orderId exists
        if (!orderId) {
          return res.status(400).json({ message: "Order ID is required" });
        }

        // Find specific order by custom orderId
        const order = await orderCollection.findOne({ orderId: orderId });

        if (!order) {
          return res.status(404).json({ message: "Order not found" });
        }

        res.json(order);
      } catch (error) {
        console.error("Error fetching order:", error);
        res.status(500).json({ message: "Internal server error" });
      }
    });

    // latest product
    app.get("/latestProducts", async (req, res) => {
      try {
        // Step 1: Get the latest categories from MongoDB (sorted by _id)
        const data = await productsCollection
          .find({})
          .sort({ _id: -1 }) // sort newest first
          .limit(10) // fetch more in case nested structure varies
          .toArray();

        // Step 2: Flatten nested products
        let allProducts = [];
        data.forEach((cat) => {
          cat.brands?.forEach((brand) => {
            brand.types?.forEach((type) => {
              allProducts.push({
                ...type,
                category: cat.category,
                brand: brand.name,
                createdAt: cat._id.getTimestamp(), // extract date from ObjectId
              });
            });
          });
        });

        // Step 3: Sort by creation time (latest first)
        allProducts.sort((a, b) => b.createdAt - a.createdAt);

        // Step 4: Limit to 3–4 latest items
        const latestProducts = allProducts.slice(0, 4);

        // Step 5: Return to frontend
        res.send(latestProducts);
      } catch (error) {
        console.error("Error fetching latest products:", error);
        res.status(500).send({ error: "Failed to fetch latest products" });
      }
    });
  } finally {
  }
}

run().catch(console.log);

app.get("/", async (req, res) => {
  res.send("Vape server is running");
});

app.listen(port, () => console.log(`Vape server is running on port ${port}`));
